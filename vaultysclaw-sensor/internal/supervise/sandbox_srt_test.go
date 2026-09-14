package supervise

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
	"github.com/vaultys/VaultysClaw/sdk-go/rules"
)

func decodeSettings(t *testing.T, spec SandboxSpec) srtSettings {
	t.Helper()
	raw, err := BuildSRTSettings(spec)
	if err != nil {
		t.Fatalf("BuildSRTSettings: %v", err)
	}
	var out srtSettings
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("settings are not valid JSON: %v", err)
	}
	return out
}

// DenyAll means neither read nor write; DenyWrite means write only. Getting
// these the wrong way round is the whole failure mode — a read-deny on the
// supervisor's own settings file would break the launch, since the harness must
// read it to install the hook.
func TestSRTSettingsMapBothDenyKinds(t *testing.T) {
	t.Parallel()
	got := decodeSettings(t, SandboxSpec{
		DenyAll:        []string{"/home/fx/.ssh"},
		DenyWrite:      []string{"/home/fx/.vaultysclaw/settings.json"},
		AllowedDomains: []string{"api.anthropic.com"},
	})

	if !contains(got.Filesystem.DenyRead, "/home/fx/.ssh") {
		t.Error("a DenyAll path must be read-denied")
	}
	if !contains(got.Filesystem.DenyWrite, "/home/fx/.ssh") {
		t.Error("a DenyAll path must be write-denied too")
	}
	if contains(got.Filesystem.DenyRead, "/home/fx/.vaultysclaw/settings.json") {
		t.Error("a DenyWrite path must stay readable — the harness reads the settings file to install the hook")
	}
	if !contains(got.Filesystem.DenyWrite, "/home/fx/.vaultysclaw/settings.json") {
		t.Error("a DenyWrite path must be write-denied")
	}
}

// srt's write model is allow-then-deny, the opposite of its read model. Granting
// "/" is what preserves this project's deny-list semantics; srt's own default
// grants nothing, which would be an allow-list and a different product.
func TestSRTSettingsKeepWritesPermittedExceptWhereDenied(t *testing.T) {
	t.Parallel()
	got := decodeSettings(t, SandboxSpec{AllowedDomains: []string{"example.com"}})
	if !contains(got.Filesystem.AllowWrite, "/") {
		t.Fatalf("allowWrite = %v, want it to grant / so denies are what restrict", got.Filesystem.AllowWrite)
	}
	if len(got.Filesystem.AllowRead) != 0 {
		t.Errorf("allowRead = %v, want empty — reads are permitted by default and this list re-opens denied regions", got.Filesystem.AllowRead)
	}
}

// srt validates with a schema that requires these arrays and refuses to fall
// back to a default configuration. A nil slice marshals to null, not [], and
// null fails validation — so the launch would fail with a schema error instead
// of running confined.
func TestSRTSettingsNeverEmitNullArrays(t *testing.T) {
	t.Parallel()
	raw, err := BuildSRTSettings(SandboxSpec{AllowedDomains: []string{"example.com"}})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "null") {
		t.Fatalf("settings contain a null array, which srt's schema rejects:\n%s", raw)
	}
}

// An unrestricted scope has no rendering: inventing a domain list would be
// policy nobody signed, and an empty list means the opposite (deny everything).
func TestSRTSettingsRefuseAnUnrestrictedScope(t *testing.T) {
	t.Parallel()
	if _, err := BuildSRTSettings(SandboxSpec{NetworkUnrestricted: true}); err == nil {
		t.Fatal("expected a refusal rather than an invented domain list")
	}
}

func TestNewSandboxRefusesAnUnrestrictedScope(t *testing.T) {
	t.Parallel()
	_, err := NewSandbox(SandboxSpec{NetworkUnrestricted: true}, t.TempDir())
	if err == nil {
		t.Fatal("expected an error")
	}
	var unavailable ErrSandboxUnavailable
	if !asSandboxUnavailable(err, &unavailable) {
		t.Fatalf("got %T (%v), want ErrSandboxUnavailable so `sandbox: require` refuses and `auto` degrades", err, err)
	}
	// The operator has to be able to act on this without reading the source.
	if !strings.Contains(err.Error(), "allowedDomains") {
		t.Errorf("the refusal does not name what to fix: %v", err)
	}
}

// Empty and absent are opposites here: absent means "no limit", empty means
// "deny everything". Collapsing them would either invent policy or break every
// harness on a host whose admin asked for the least restriction.
func TestDomainScopeDistinguishesAbsentFromEmpty(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name             string
		certs            []authz.Certificate
		wantUnrestricted bool
		wantDomains      []string
	}{
		{"no certificate at all", nil, true, nil},
		{"certificate with no resource limits",
			[]authz.Certificate{{ID: "c"}}, true, nil},
		{"certificate with an empty domain list",
			[]authz.Certificate{{ID: "c", ResourceLimits: &authz.ResourceLimits{AllowedDomains: []string{}}}}, true, nil},
		{"certificate with a scope",
			[]authz.Certificate{{ID: "c", ResourceLimits: &authz.ResourceLimits{AllowedDomains: []string{"api.anthropic.com"}}}},
			false, []string{"api.anthropic.com"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			domains, unrestricted := domainScope(tc.certs)
			if unrestricted != tc.wantUnrestricted {
				t.Fatalf("unrestricted = %v, want %v", unrestricted, tc.wantUnrestricted)
			}
			if len(domains) != len(tc.wantDomains) {
				t.Fatalf("domains = %v, want %v", domains, tc.wantDomains)
			}
		})
	}
}

// A signed `deny https://…` rule already refuses at the tool boundary. This is
// what makes the same rule refuse underneath it, which the seatbelt backend
// could not do at all.
func TestSignedHostDeniesExtractsHostnames(t *testing.T) {
	t.Parallel()
	set := &rules.Set{ResourceRules: []rules.ResourceRule{
		{ID: "deny vaultys", Subject: rules.SubjectAny, Effect: rules.EffectDeny,
			Resources: []string{"https://vaultys.com"}},
		{ID: "deny path", Subject: rules.SubjectAny, Effect: rules.EffectDeny,
			Resources: []string{"file:///home/fx/.ssh"}},
		{ID: "allow", Subject: rules.SubjectAny, Effect: rules.EffectAllow,
			Resources: []string{"https://example.com"}},
	}}
	got := signedHostDenies(set)
	if len(got) != 1 || got[0] != "vaultys.com" {
		t.Fatalf("got %v, want only [vaultys.com] — a file rule has no hostname and an allow is not a deny", got)
	}
}

// The port is dropped deliberately: a rule's scheme implies its port, and
// turning https:// into ":443" would stop denying the host on every other port,
// which is less than the rule says.
func TestSignedHostDeniesDropsThePort(t *testing.T) {
	t.Parallel()
	set := &rules.Set{ResourceRules: []rules.ResourceRule{
		{ID: "d", Subject: rules.SubjectAny, Effect: rules.EffectDeny,
			Resources: []string{"https://internal.example.com:8443/*"}},
	}}
	got := signedHostDenies(set)
	if len(got) != 1 || got[0] != "internal.example.com" {
		t.Fatalf("got %v, want [internal.example.com]", got)
	}
}

func contains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}

func asSandboxUnavailable(err error, target *ErrSandboxUnavailable) bool {
	if e, ok := err.(ErrSandboxUnavailable); ok {
		*target = e
		return true
	}
	return false
}

// The safety property of the whole feature: a signed block is policy being
// *added*, and adding policy must never remove protection. An admin who writes
// an srt block that says nothing about ~/.ssh has not un-protected it.
func TestSRTSettingsMergeCannotRemoveTheFloor(t *testing.T) {
	t.Parallel()
	got := decodeSettings(t, SandboxSpec{
		Base: []byte(`{
			"filesystem": {"denyRead": ["/home/fx/.aws"], "allowRead": [], "allowWrite": ["/work"], "denyWrite": []},
			"network": {"allowedDomains": ["api.anthropic.com"], "deniedDomains": []}
		}`),
		DenyAll:   []string{"/home/fx/.ssh"},
		DenyWrite: []string{"/home/fx/.vaultysclaw/grant.token"},
	})

	if !contains(got.Filesystem.DenyRead, "/home/fx/.ssh") {
		t.Error("the floor's deny was dropped by a block that did not mention it")
	}
	if !contains(got.Filesystem.DenyRead, "/home/fx/.aws") {
		t.Error("the block's own deny was lost in the merge")
	}
	if !contains(got.Filesystem.DenyWrite, "/home/fx/.vaultysclaw/grant.token") {
		t.Error("a supervisor whose own grant is writable by what it supervises is not supervising anything")
	}
	if !contains(got.Filesystem.DenyWrite, "/home/fx/.ssh") {
		t.Error("a DenyAll path must be write-denied even when the block lists no writes")
	}
}

// srt owns this schema; a field this binary has never heard of must still reach
// it. Dropping one would silently weaken a confinement an admin wrote.
func TestSRTSettingsPreserveUnknownKeys(t *testing.T) {
	t.Parallel()
	raw, err := BuildSRTSettings(SandboxSpec{
		Base: []byte(`{
			"filesystem": {"denyRead": [], "allowRead": [], "allowWrite": ["/"], "denyWrite": []},
			"network": {"allowedDomains": ["example.com"], "deniedDomains": [], "allowUnixSockets": ["/var/run/docker.sock"]},
			"ignoreViolations": {"npm": ["/private/tmp"]},
			"someFutureKey": {"nested": true}
		}`),
		DenyAll: []string{"/home/fx/.ssh"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"ignoreViolations", "someFutureKey"} {
		if _, ok := doc[key]; !ok {
			t.Errorf("top-level %q was dropped", key)
		}
	}
	net, _ := doc["network"].(map[string]any)
	if _, ok := net["allowUnixSockets"]; !ok {
		t.Error("a nested unknown key inside a merged object was dropped")
	}
}

// A block that states its own egress scope answers the question the
// certificate's allowedDomains would have — including when it states an empty
// one, which means deny-all and is a scope, not an absence.
func TestSRTSettingsBlockOwnsTheNetworkScope(t *testing.T) {
	t.Parallel()
	got := decodeSettings(t, SandboxSpec{
		Base: []byte(`{"network": {"allowedDomains": ["github.com"], "deniedDomains": []}}`),
		// What the certificate said, which the block overrides.
		AllowedDomains: []string{"example.com"},
		DeniedDomains:  []string{"vaultys.com"},
	})
	if len(got.Network.AllowedDomains) != 1 || got.Network.AllowedDomains[0] != "github.com" {
		t.Fatalf("allowedDomains = %v, want the block's own list", got.Network.AllowedDomains)
	}
	// Denies still merge: a signed `deny https://…` rule is additional policy.
	if !contains(got.Network.DeniedDomains, "vaultys.com") {
		t.Error("a signed host deny was dropped by a block that declared its own network scope")
	}
}

func TestSRTSettingsEmptyAllowedDomainsInBlockIsAScope(t *testing.T) {
	t.Parallel()
	spec := SandboxSpec{
		Base:                []byte(`{"network": {"allowedDomains": [], "deniedDomains": []}}`),
		NetworkUnrestricted: true, // what the certificate's own fields said
	}
	if !baseDeclaresNetwork(spec.Base) {
		t.Fatal("an explicitly empty allowedDomains is a scope — deny everything — not an absence")
	}
	if _, err := BuildSRTSettings(spec); err != nil {
		t.Fatalf("a block with an explicit deny-all scope must render: %v", err)
	}
}

// Refused rather than ignored: falling back to derived settings would enforce
// something other than what was signed while reporting confinement as active.
func TestSRTSettingsRefuseAMalformedBlock(t *testing.T) {
	t.Parallel()
	_, err := BuildSRTSettings(SandboxSpec{Base: []byte(`{"filesystem": `), AllowedDomains: []string{"x.com"}})
	if err == nil {
		t.Fatal("expected a refusal for a malformed srt block")
	}
	if !strings.Contains(err.Error(), "srt block") {
		t.Errorf("the error does not say what is wrong: %v", err)
	}
}
