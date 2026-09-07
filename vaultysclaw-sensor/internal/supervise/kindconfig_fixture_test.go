package supervise

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/identity"
)

// The Go half of conformance/kindconfig-fixture.json.
//
// Regenerate the fixture with:
//
//	pnpm tsx conformance/generate-kindconfig-fixture.ts
//
// A disagreement here is silent in production: every field of PushedConfig is a
// pointer, so a tag mismatch decodes to nil, nil means "absent", and absent is
// applied as "no change". A valid signed configuration would verify, decode, and
// do nothing at all.
const kindConfigFixturePath = "../../../conformance/kindconfig-fixture.json"

type kindConfigFixture struct {
	ServerIDBase64 string `json:"serverIdBase64"`
	ServerDID      string `json:"serverDid"`
	Token          string `json:"token"`
	ExpectedConfig struct {
		Mode                string `json:"mode"`
		Sandbox             string `json:"sandbox"`
		MaxStatusAgeSeconds int    `json:"maxStatusAgeSeconds"`
	} `json:"expectedConfig"`
}

func TestVerifiesAKindConfigSignedByTypeScript(t *testing.T) {
	raw, err := os.ReadFile(filepath.Clean(kindConfigFixturePath))
	if err != nil {
		t.Fatalf("reading %s: %v (regenerate with: pnpm tsx conformance/generate-kindconfig-fixture.ts)", kindConfigFixturePath, err)
	}
	var f kindConfigFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("parsing %s: %v", kindConfigFixturePath, err)
	}
	if f.Token == "" {
		t.Fatal("fixture has no token")
	}

	anchor, err := grant.PinFromConfig(filepath.Join(t.TempDir(), "anchor.json"), f.ServerIDBase64)
	if err != nil {
		t.Fatalf("pinning the fixture's signer: %v", err)
	}
	if got := anchor.DID(); got != f.ServerDID {
		t.Errorf("DID = %q, want %q", got, f.ServerDID)
	}

	cfg, err := VerifiedConfig(anchor, f.Token)
	if err != nil {
		t.Fatalf("VerifiedConfig on a TypeScript-signed kindConfig: %v", err)
	}

	// Each field checked for presence *first*: nil is the failure this fixture
	// exists to catch, and comparing a dereferenced nil would panic rather than
	// report it.
	if cfg.Mode == nil {
		t.Fatal("mode decoded as absent — the msgpack tag does not match what the control plane signs")
	}
	if *cfg.Mode != f.ExpectedConfig.Mode {
		t.Errorf("mode = %q, want %q", *cfg.Mode, f.ExpectedConfig.Mode)
	}
	if cfg.Sandbox == nil {
		t.Fatal("sandbox decoded as absent")
	}
	if *cfg.Sandbox != f.ExpectedConfig.Sandbox {
		t.Errorf("sandbox = %q, want %q", *cfg.Sandbox, f.ExpectedConfig.Sandbox)
	}
	if cfg.MaxStatusAgeSeconds == nil {
		t.Fatal("maxStatusAgeSeconds decoded as absent")
	}
	if *cfg.MaxStatusAgeSeconds != f.ExpectedConfig.MaxStatusAgeSeconds {
		t.Errorf("maxStatusAgeSeconds = %d, want %d", *cfg.MaxStatusAgeSeconds, f.ExpectedConfig.MaxStatusAgeSeconds)
	}
}

func TestAnUnverifiableKindConfigIsRefused(t *testing.T) {
	// There is no degraded mode for an unverifiable configuration: it is
	// indistinguishable from an attacker-supplied one, and falling back to the
	// unsigned copy on a signature failure would make forging one no harder than
	// corrupting a byte of the real one.
	raw, err := os.ReadFile(filepath.Clean(kindConfigFixturePath))
	if err != nil {
		t.Skipf("no fixture: %v", err)
	}
	var f kindConfigFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()

	t.Run("a token signed by a different identity", func(t *testing.T) {
		// A genuinely separate key, not a mutated copy of the fixture's id.
		//
		// Flipping a byte of a serialized VaultysId was the first attempt and it
		// passed verification: the trailing bytes are the *encryption* key, so
		// the mutated identity still carried the same Ed25519 signing key. The
		// test proved nothing while looking like it proved everything.
		other, err := identity.LoadOrCreate(filepath.Join(dir, "other.key"))
		if err != nil {
			t.Fatal(err)
		}
		anchor, err := grant.PinFromConfig(filepath.Join(dir, "other-anchor.json"),
			base64.StdEncoding.EncodeToString(other.VaultysID().ID()))
		if err != nil {
			t.Fatalf("pinning a second identity: %v", err)
		}
		if anchor.DID() == f.ServerDID {
			t.Fatal("the second identity is the fixture's own — this test would prove nothing")
		}
		if _, err := VerifiedConfig(anchor, f.Token); err == nil {
			t.Fatal("a kindConfig signed by another key must be refused")
		}
	})

	t.Run("a tampered token", func(t *testing.T) {
		anchor, err := grant.PinFromConfig(filepath.Join(dir, "anchor.json"), f.ServerIDBase64)
		if err != nil {
			t.Fatal(err)
		}
		// Corrupt the body, not the trailing signature, so this exercises the
		// signature *check* rather than a malformed-signature parse error.
		tampered := []byte(f.Token)
		tampered[10] ^= 0x01
		if _, err := VerifiedConfig(anchor, string(tampered)); err == nil {
			t.Fatal("a tampered kindConfig must be refused")
		}
	})
}
