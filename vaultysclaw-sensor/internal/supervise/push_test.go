package supervise

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vaultys/VaultysClaw/sdk-go/vconn"
)

func local() Local {
	return Local{Mode: "explicit", Sandbox: "require", MaxStatusAgeSeconds: 3600}
}

func push(t *testing.T, l Local, body string) Applied {
	t.Helper()
	got, err := ApplyPushedConfig(l, json.RawMessage(body))
	if err != nil {
		t.Fatalf("ApplyPushedConfig: %v", err)
	}
	return got
}

// The attack this whole file exists to stop: anyone who can reach the socket
// pushes "stop enforcing", and the host keeps running, keeps reporting, and
// refuses nothing.
func TestAPushCannotSwitchEnforcementOff(t *testing.T) {
	got := push(t, local(), `{"mode":"observe","sandbox":"off","maxStatusAgeSeconds":-1}`)

	if got.Mode != "explicit" {
		t.Errorf("mode = %q, want the local explicit kept", got.Mode)
	}
	if got.Sandbox != "require" {
		t.Errorf("sandbox = %q, want the local require kept", got.Sandbox)
	}
	if got.MaxStatusAgeSeconds != 3600 {
		t.Errorf("maxStatusAgeSeconds = %d, want the local 3600 kept", got.MaxStatusAgeSeconds)
	}
	if len(got.Refused) != 3 {
		t.Errorf("refused = %v, want all three loosenings refused", got.Refused)
	}
	// A refusal nobody can see is the same as not refusing: the caller has to be
	// able to say what the push tried to do.
	for _, want := range []string{"mode", "sandbox", "maxStatusAgeSeconds"} {
		if !strings.Contains(strings.Join(got.Refused, " "), want) {
			t.Errorf("refused = %v, want it to name %s", got.Refused, want)
		}
	}
}

func TestAPushMayTighten(t *testing.T) {
	// The direction that is safe, and the reason the push is worth having at all:
	// an admin can raise a fleet's enforcement from the console.
	loose := Local{Mode: "observe", Sandbox: "off", MaxStatusAgeSeconds: -1}
	got := push(t, loose, `{"mode":"explicit","sandbox":"require","maxStatusAgeSeconds":60}`)

	if got.Mode != "explicit" || got.Sandbox != "require" || got.MaxStatusAgeSeconds != 60 {
		t.Fatalf("got %+v, want every setting tightened", got.Local)
	}
	if len(got.Tightened) != 3 || len(got.Refused) != 0 {
		t.Errorf("tightened = %v, refused = %v", got.Tightened, got.Refused)
	}
}

func TestStatusAgeOrderingIsNotNumeric(t *testing.T) {
	// 0 is the strictest value, not the loosest, and a negative is unbounded.
	// Treating these as plain numbers is how an admin asking for maximum rigor
	// gets maximum laxity — the inversion docs/PROXY_ARCHITECTURE.md records.
	tests := []struct {
		name          string
		localAge      int
		pushed        int
		wantAge       int
		wantTightened bool
	}{
		{"0 tightens a positive bound", 3600, 0, 0, true},
		{"0 tightens unbounded", -1, 0, 0, true},
		{"a positive bound tightens unbounded", -1, 60, 60, true},
		{"unbounded never loosens a positive bound", 60, -1, 60, false},
		{"unbounded never loosens 0", 0, -1, 0, false},
		{"a positive bound never loosens 0", 0, 3600, 0, false},
		{"a smaller positive bound tightens a larger one", 3600, 60, 60, true},
		{"a larger positive bound is refused", 60, 3600, 60, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			l := local()
			l.MaxStatusAgeSeconds = tc.localAge
			body, _ := json.Marshal(map[string]int{"maxStatusAgeSeconds": tc.pushed})
			got := push(t, l, string(body))
			if got.MaxStatusAgeSeconds != tc.wantAge {
				t.Errorf("maxStatusAgeSeconds = %d, want %d", got.MaxStatusAgeSeconds, tc.wantAge)
			}
			if tightened := len(got.Tightened) > 0; tightened != tc.wantTightened {
				t.Errorf("tightened = %v, want %v (refused: %v)", tightened, tc.wantTightened, got.Refused)
			}
		})
	}
}

func TestAnUnrecognisedValueChangesNothing(t *testing.T) {
	// It could be a newer, stricter setting this binary does not know. Guessing
	// which direction it points is exactly the guess that must not be made.
	got := push(t, local(), `{"mode":"paranoid","sandbox":"hermetic"}`)
	if got.Mode != "explicit" || got.Sandbox != "require" {
		t.Fatalf("got %+v, want the local settings untouched", got.Local)
	}
	if len(got.Refused) != 2 {
		t.Errorf("refused = %v, want both unrecognised values reported", got.Refused)
	}
}

func TestAnAbsentFieldIsNotTheZeroValue(t *testing.T) {
	// `observe` is a real setting and "no opinion" is another; collapsing them
	// would make every push that omits mode silently propose observe.
	got := push(t, local(), `{"sandbox":"require"}`)
	if got.Mode != "explicit" {
		t.Errorf("mode = %q, want the local value untouched by a push that said nothing about it", got.Mode)
	}
	if len(got.Refused) != 0 {
		t.Errorf("refused = %v, want nothing refused", got.Refused)
	}
}

func TestAMalformedPushAppliesNothing(t *testing.T) {
	// Half a configuration is one nobody authored.
	got, err := ApplyPushedConfig(local(), json.RawMessage(`{"mode":`))
	if err == nil {
		t.Fatal("a malformed kindConfig must be refused, not partially applied")
	}
	if got.Mode != "explicit" || got.Sandbox != "require" {
		t.Errorf("got %+v, want the local configuration intact", got.Local)
	}
}

func TestWriteArtefactsPersistsOnlyTheSignedHalf(t *testing.T) {
	dir := t.TempDir()
	grant := filepath.Join(dir, "grant.token")
	rules := filepath.Join(dir, "rules.token")

	g, r := "GRANT-TOKEN", "RULES-TOKEN"
	if err := WriteArtefacts(vconn.ActorConfigPayload{GrantToken: &g, RuleSetToken: &r}, grant, rules); err != nil {
		t.Fatal(err)
	}
	for path, want := range map[string]string{grant: g, rules: r} {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if string(body) != want {
			t.Errorf("%s = %q, want %q", path, body, want)
		}
		info, _ := os.Stat(path)
		if perm := info.Mode().Perm(); perm != 0o600 {
			t.Errorf("%s mode = %o, want 600", path, perm)
		}
	}
}

func TestANullTokenDoesNotEraseAWorkingArtefact(t *testing.T) {
	// The control plane sends null when it has nothing to give — no active
	// certificate, no rules. Erasing a working local artefact because an
	// unauthenticated message said nothing is a denial of service anyone on the
	// socket could perform.
	dir := t.TempDir()
	grant := filepath.Join(dir, "grant.token")
	if err := os.WriteFile(grant, []byte("EXISTING"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := WriteArtefacts(vconn.ActorConfigPayload{}, grant, filepath.Join(dir, "rules.token")); err != nil {
		t.Fatal(err)
	}
	body, _ := os.ReadFile(grant)
	if string(body) != "EXISTING" {
		t.Errorf("grant = %q, want the existing artefact untouched", body)
	}
}

// The reported failure, and its fix: an admin setting `sandbox: auto` in the
// console on a host configured `require` was refused, because an unsigned push
// may only tighten. With a signature the direction stops mattering.
func TestASignedConfigMayRelax(t *testing.T) {
	got := ApplyVerifiedConfig(local(), PushedConfig{
		Mode:    strPtr("observe"),
		Sandbox: strPtr("auto"),
	})
	if got.Mode != "observe" || got.Sandbox != "auto" {
		t.Fatalf("got %+v, want the signed settings applied in both directions", got.Local)
	}
	if len(got.Refused) != 0 {
		t.Errorf("refused = %v, want nothing refused — a signature is an admin's decision", got.Refused)
	}
	if len(got.Changed) != 2 {
		t.Errorf("changed = %v, want both settings reported", got.Changed)
	}
}

func TestASignedConfigStillLeavesAbsentFieldsAlone(t *testing.T) {
	// A config that says nothing about a setting is not one that sets it to zero.
	got := ApplyVerifiedConfig(local(), PushedConfig{Sandbox: strPtr("auto")})
	if got.Mode != "explicit" {
		t.Errorf("mode = %q, want the local value untouched", got.Mode)
	}
	if got.MaxStatusAgeSeconds != 3600 {
		t.Errorf("maxStatusAgeSeconds = %d, want the local value untouched", got.MaxStatusAgeSeconds)
	}
}

func strPtr(s string) *string { return &s }
