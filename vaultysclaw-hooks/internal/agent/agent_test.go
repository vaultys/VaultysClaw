package agent

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/VaultysClaw/sdk-go/vconn"

	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// fixture reads one of the TypeScript-signed conformance fixtures. All of them
// are signed by the same throwaway control-plane key.
type fixture struct {
	ServerIDBase64 string `json:"serverIdBase64"`
	Token          string `json:"token"`
}

func loadFixture(t *testing.T, name string) fixture {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "conformance", name))
	if err != nil {
		t.Fatal(err)
	}
	var f fixture
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	return f
}

func setup(t *testing.T) (state.Paths, *grant.Anchor) {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	p := state.PathsFor(state.ScopeUser, filepath.Join(t.TempDir(), "state"))
	res, err := Enroll(state.ScopeUser, p, Coordinates{
		URL:            "ws://127.0.0.1:1",
		ControlPlaneID: loadFixture(t, "grant-fixture.json").ServerIDBase64,
		Name:           "test-host",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(res.DID, "did:vaultys:") {
		t.Fatalf("DID = %q", res.DID)
	}
	anchor, err := grant.LoadAnchor(p.Anchor)
	if err != nil {
		t.Fatal(err)
	}
	return p, anchor
}

func ptr(s string) *string { return &s }

func TestEnrollRefusesADifferentControlPlane(t *testing.T) {
	p, _ := setup(t)
	_, err := Enroll(state.ScopeUser, p, Coordinates{
		URL:            "ws://127.0.0.1:1",
		ControlPlaneID: otherControlPlaneID(t),
	})
	if err == nil {
		t.Fatal("re-enrolling against another control plane must fail, not re-point the host")
	}
}

func TestApplyPushWritesVerifiedArtefactsAndSignedSettings(t *testing.T) {
	p, anchor := setup(t)
	payload := vconn.ActorConfigPayload{
		GrantToken:      ptr(loadFixture(t, "grant-fixture.json").Token),
		KindConfigToken: ptr(loadFixture(t, "kindconfig-fixture.json").Token),
	}
	rep, err := ApplyPush(state.ScopeUser, p, anchor, payload, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if !rep.GrantWritten || !rep.SignedConfig {
		t.Fatalf("report = %+v", rep)
	}
	pol, err := state.LoadPolicy(p, time.Now())
	if err != nil || !pol.Provisioned() {
		t.Fatalf("the written grant must load and verify: pol=%+v err=%v", pol, err)
	}
	cfg, err := state.LoadConfig(p.Config)
	if err != nil {
		t.Fatal(err)
	}
	// The fixture signs {mode: explicit, maxStatusAgeSeconds: 3600}.
	if cfg.Mode != state.ModeEnforce || cfg.MaxStatusAgeSeconds != 3600 {
		t.Fatalf("signed settings not applied: %+v", cfg)
	}
}

func TestApplyPushWritesNothingWhenAnyTokenFails(t *testing.T) {
	p, anchor := setup(t)
	good := loadFixture(t, "grant-fixture.json").Token
	payload := vconn.ActorConfigPayload{
		GrantToken:   ptr(good),
		RuleSetToken: ptr("not-a-token"),
	}
	if _, err := ApplyPush(state.ScopeUser, p, anchor, payload, time.Now()); err == nil {
		t.Fatal("a push with an unverifiable rule set must be refused")
	}
	if fileExists(p.Grant) {
		t.Fatal("the valid grant must not be written alongside a refused rule set")
	}

	payload = vconn.ActorConfigPayload{GrantToken: ptr(good), KindConfigToken: ptr("forged")}
	if _, err := ApplyPush(state.ScopeUser, p, anchor, payload, time.Now()); err == nil || fileExists(p.Grant) {
		t.Fatalf("a forged kindConfig must refuse the whole push (err=%v)", err)
	}
}

func TestNilTokensClearNothing(t *testing.T) {
	p, anchor := setup(t)
	if _, err := ApplyPush(state.ScopeUser, p, anchor, vconn.ActorConfigPayload{GrantToken: ptr(loadFixture(t, "grant-fixture.json").Token)}, time.Now()); err != nil {
		t.Fatal(err)
	}
	if _, err := ApplyPush(state.ScopeUser, p, anchor, vconn.ActorConfigPayload{}, time.Now()); err != nil {
		t.Fatal(err)
	}
	if !fileExists(p.Grant) {
		t.Fatal("an empty push must not erase a working grant")
	}
}

func TestUnsignedConfigOnlyTightens(t *testing.T) {
	p, anchor := setup(t)
	push := func(raw string) PushReport {
		t.Helper()
		rep, err := ApplyPush(state.ScopeUser, p, anchor, vconn.ActorConfigPayload{KindConfig: json.RawMessage(raw)}, time.Now())
		if err != nil {
			t.Fatal(err)
		}
		return rep
	}
	load := func() state.Config {
		t.Helper()
		c, err := state.LoadConfig(p.Config)
		if err != nil {
			t.Fatal(err)
		}
		return c
	}

	push(`{"mode":"explicit","maxStatusAgeSeconds":600}`)
	if c := load(); c.Mode != state.ModeEnforce || c.MaxStatusAgeSeconds != 600 {
		t.Fatalf("tightening must apply: %+v", c)
	}
	rep := push(`{"mode":"observe","maxStatusAgeSeconds":-1}`)
	if c := load(); c.Mode != state.ModeEnforce || c.MaxStatusAgeSeconds != 600 {
		t.Fatalf("loosening from an unsigned push must be refused: %+v", c)
	}
	if len(rep.Refused) != 2 {
		t.Fatalf("both refusals must be reported, got %v", rep.Refused)
	}
}

func TestStricterAge(t *testing.T) {
	cases := []struct {
		pushed, local int
		want          bool
	}{
		{600, -1, true}, {0, 600, true}, {300, 600, true},
		{900, 600, false}, {-1, 600, false}, {-1, -1, false},
	}
	for _, c := range cases {
		if got := stricterAge(c.pushed, c.local); got != c.want {
			t.Errorf("stricterAge(%d, %d) = %v, want %v", c.pushed, c.local, got, c.want)
		}
	}
}

// otherControlPlaneID is a well-formed VaultysID that is not the pinned one.
func otherControlPlaneID(t *testing.T) string {
	t.Helper()
	id, err := identity.LoadOrCreate(filepath.Join(t.TempDir(), "other.key"))
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(id.VaultysID().ID())
}
