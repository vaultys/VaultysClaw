package intercept

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/rules"
)

func packToken(t *testing.T, vid *vaultysid.VaultysID, payload any) string {
	t.Helper()
	raw, err := msgpack.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	sig, err := vid.SignChallenge(raw)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	lenBuf := make([]byte, 4)
	binary.LittleEndian.PutUint32(lenBuf, uint32(len(raw)))
	return base64.StdEncoding.EncodeToString(append(append(lenBuf, raw...), sig...))
}

func grantToken(t *testing.T, vid *vaultysid.VaultysID, caps []string, domains []string) string {
	t.Helper()
	var limits *grant.WireLimits
	if domains != nil {
		limits = &grant.WireLimits{AllowedDomains: domains}
	}
	return packToken(t, vid, grant.Body{
		Type:                "capability_grant",
		CertID:              "cert-store",
		AgentDID:            "did:vaultys:proxy",
		GrantedCapabilities: caps,
		ResourceLimits:      limits,
		IssuedAt:            time.Now().UnixMilli(),
	})
}

type storeFixture struct {
	server      *vaultysid.VaultysID
	anchor      *grant.Anchor
	dir         string
	grantPath   string
	ruleSetPath string
}

func newStoreFixture(t *testing.T) storeFixture {
	t.Helper()
	dir := t.TempDir()
	server, err := vaultysid.GenerateMachine()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	anchor, err := grant.Pin(filepath.Join(dir, "anchor.json"), server)
	if err != nil {
		t.Fatalf("Pin: %v", err)
	}
	return storeFixture{
		server:      server,
		anchor:      anchor,
		dir:         dir,
		grantPath:   filepath.Join(dir, "grant.token"),
		ruleSetPath: filepath.Join(dir, "rules.token"),
	}
}

func (f storeFixture) write(t *testing.T, path, token string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(token+"\n"), 0o600); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func (f storeFixture) opts(attributionAvailable bool) StoreOptions {
	return StoreOptions{
		Anchor:               f.anchor,
		GrantPath:            f.grantPath,
		RuleSetPath:          f.ruleSetPath,
		AttributionAvailable: attributionAvailable,
	}
}

func TestStoreLoadsAVerifiedGrantAndRuleSet(t *testing.T) {
	f := newStoreFixture(t)
	f.write(t, f.grantPath, grantToken(t, f.server, []string{"internet_access"}, []string{"api.github.com"}))
	f.write(t, f.ruleSetPath, packToken(t, f.server, rules.Set{
		Version: 1,
		Rules: []rules.Rule{
			{ID: "deny-openai", Subject: rules.SubjectAny, Hosts: []string{".openai.com"}, Effect: rules.EffectDeny},
		},
	}))

	s, err := NewStore(f.opts(false))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	cfg := s.ConfigFor(-1, true)()
	if len(cfg.Certs) != 1 || cfg.Certs[0].ID != "cert-store" {
		t.Fatalf("certs = %+v", cfg.Certs)
	}
	if cfg.Certs[0].Status != authz.StatusActive {
		t.Errorf("status = %q, want active", cfg.Certs[0].Status)
	}
	if cfg.Rules == nil || len(cfg.Rules.Rules) != 1 {
		t.Fatalf("rules = %+v", cfg.Rules)
	}
	if cfg.SyncedAt.IsZero() {
		t.Error("SyncedAt is zero — the staleness bound would have nothing to measure from")
	}

	// The loaded state must actually decide as intended, end to end.
	if out := Decide(cfg, rules.Destination{Host: "api.openai.com", Port: 443}, nil, time.Now()); out.Allowed {
		t.Error("the deny rule did not take effect")
	}
	if out := Decide(cfg, rules.Destination{Host: "api.github.com", Port: 443}, nil, time.Now()); !out.Allowed {
		t.Errorf("an allowed domain was denied: %q", out.Reason)
	}
	if out := Decide(cfg, rules.Destination{Host: "elsewhere.example", Port: 443}, nil, time.Now()); out.Allowed {
		t.Error("allowedDomains was not enforced")
	}
}

func TestStoreRefusesToStartWithNoGrant(t *testing.T) {
	// A proxy that will refuse everything looks identical to one that works.
	// The operator learns the difference at startup, not from the spool.
	f := newStoreFixture(t)
	_, err := NewStore(f.opts(false))
	if !errors.Is(err, ErrNoGrant) {
		t.Fatalf("err = %v, want ErrNoGrant", err)
	}
}

func TestStoreRejectsAGrantSignedByAnotherIdentity(t *testing.T) {
	f := newStoreFixture(t)
	attacker, _ := vaultysid.GenerateMachine()
	f.write(t, f.grantPath, grantToken(t, attacker, []string{"internet_access", "system_command"}, nil))

	if _, err := NewStore(f.opts(false)); err == nil {
		t.Fatal("NewStore accepted a grant the pinned control plane did not sign")
	}
}

func TestStoreRejectsAForgedRuleSet(t *testing.T) {
	f := newStoreFixture(t)
	attacker, _ := vaultysid.GenerateMachine()
	f.write(t, f.grantPath, grantToken(t, f.server, []string{"internet_access"}, nil))
	// A locally-written rule set lifting the restrictions must not load.
	f.write(t, f.ruleSetPath, packToken(t, attacker, rules.Set{
		Rules: []rules.Rule{{ID: "allow-all", Subject: rules.SubjectAny, Hosts: []string{".com"}, Effect: rules.EffectAllow}},
	}))

	if _, err := NewStore(f.opts(false)); err == nil {
		t.Fatal("NewStore accepted a forged rule set")
	}
}

func TestStoreWorksWithNoRuleSetAtAll(t *testing.T) {
	f := newStoreFixture(t)
	f.write(t, f.grantPath, grantToken(t, f.server, []string{"internet_access"}, nil))

	s, err := NewStore(f.opts(false))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	cfg := s.ConfigFor(-1, true)()
	if cfg.Rules != nil {
		t.Errorf("rules = %+v, want nil", cfg.Rules)
	}
	if out := Decide(cfg, rules.Destination{Host: "anywhere.example", Port: 443}, nil, time.Now()); !out.Allowed {
		t.Errorf("certificate-only decision denied: %q", out.Reason)
	}
}

func TestStoreRefusesSubjectRulesWhenAttributionIsUnavailable(t *testing.T) {
	// The §5.2.3 case: explicit mode has no attribution source, so a
	// subject-scoped rule can never match. Refuse at load rather than fail open
	// on every request while the admin believes it is enforcing.
	f := newStoreFixture(t)
	f.write(t, f.grantPath, grantToken(t, f.server, []string{"internet_access"}, nil))
	f.write(t, f.ruleSetPath, packToken(t, f.server, rules.Set{
		Rules: []rules.Rule{{ID: "agents-deny", Subject: rules.SubjectAgent, Hosts: []string{".example.com"}, Effect: rules.EffectDeny}},
	}))

	_, err := NewStore(f.opts(false))
	if !errors.Is(err, rules.ErrAttributionUnavailable) {
		t.Fatalf("err = %v, want ErrAttributionUnavailable", err)
	}

	// The same set is fine where attribution exists.
	if _, err := NewStore(f.opts(true)); err != nil {
		t.Errorf("with attribution available: %v", err)
	}
}

func TestReloadIsAllOrNothing(t *testing.T) {
	f := newStoreFixture(t)
	f.write(t, f.grantPath, grantToken(t, f.server, []string{"internet_access"}, nil))
	f.write(t, f.ruleSetPath, packToken(t, f.server, rules.Set{
		Rules: []rules.Rule{{ID: "deny-openai", Subject: rules.SubjectAny, Hosts: []string{".openai.com"}, Effect: rules.EffectDeny}},
	}))

	s, err := NewStore(f.opts(false))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	// Corrupt the rule set. Reload must fail *and* leave the previously verified
	// state in force — dropping the rules half would silently widen access.
	f.write(t, f.ruleSetPath, "garbage-not-a-token")
	if err := s.Reload(); err == nil {
		t.Fatal("Reload accepted a corrupt rule set")
	}

	cfg := s.ConfigFor(-1, true)()
	if cfg.Rules == nil || len(cfg.Rules.Rules) != 1 {
		t.Fatal("a failed Reload dropped the previously verified rule set")
	}
	if out := Decide(cfg, rules.Destination{Host: "api.openai.com", Port: 443}, nil, time.Now()); out.Allowed {
		t.Error("a failed Reload widened access")
	}
}

func TestReloadPicksUpANewRuleSet(t *testing.T) {
	f := newStoreFixture(t)
	f.write(t, f.grantPath, grantToken(t, f.server, []string{"internet_access"}, nil))

	s, err := NewStore(f.opts(false))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	dest := rules.Destination{Host: "api.openai.com", Port: 443}
	if out := Decide(s.ConfigFor(-1, true)(), dest, nil, time.Now()); !out.Allowed {
		t.Fatalf("precondition: expected allowed, got %q", out.Reason)
	}

	f.write(t, f.ruleSetPath, packToken(t, f.server, rules.Set{
		Rules: []rules.Rule{{ID: "deny-openai", Subject: rules.SubjectAny, Hosts: []string{".openai.com"}, Effect: rules.EffectDeny}},
	}))
	if err := s.Reload(); err != nil {
		t.Fatalf("Reload: %v", err)
	}
	if out := Decide(s.ConfigFor(-1, true)(), dest, nil, time.Now()); out.Allowed {
		t.Error("a newly provisioned deny rule did not take effect after Reload")
	}
}

func TestSummaryDescribesWhatIsEnforced(t *testing.T) {
	f := newStoreFixture(t)
	f.write(t, f.grantPath, grantToken(t, f.server, []string{"internet_access"}, []string{"api.github.com"}))
	f.write(t, f.ruleSetPath, packToken(t, f.server, rules.Set{
		Rules: []rules.Rule{{ID: "r", Subject: rules.SubjectAny, Hosts: []string{".openai.com"}, Effect: rules.EffectDeny}},
		// Both lists, because counting only one of them was the defect: a host
		// running a full set of resource rules reported "rules=0", and this line
		// is what an operator reads to confirm what is in force.
		ResourceRules: []rules.ResourceRule{
			{ID: "rr", Subject: rules.SubjectAny, Resources: []string{"file:///a/*"}, Effect: rules.EffectDeny},
			{ID: "rr2", Subject: rules.SubjectAny, Resources: []string{"exec://docker"}, Effect: rules.EffectDeny},
		},
	}))

	s, err := NewStore(f.opts(false))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	got := s.Summary()
	for _, want := range []string{"internet_access", "api.github.com", "hostRules=1", "resourceRules=2"} {
		if !strings.Contains(got, want) {
			t.Errorf("Summary() = %q, want it to mention %q", got, want)
		}
	}
}
