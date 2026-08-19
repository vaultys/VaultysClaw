// Package identity provides the sensor's (and collector's) device identity:
// a real VaultysID, generated on first run and persisted locally.
//
// Phase 1 of this sensor used a bespoke local Ed25519 keypair here,
// documented as a placeholder for a future real VaultysId integration
// (see docs/vaultysclaw-integration.md). That integration now exists:
// github.com/vaultys/vaultysid/go is a TypeScript-compatible Go port of
// the real VaultysId used throughout the rest of VaultysClaw — same DID
// derivation, same challenge-signing scheme, same msgpack-encoded
// challenge/response handshake that packages/control-plane drives for
// every real agent connection. This package is a thin wrapper around it;
// internal/vconn drives the actual handshake.
package identity

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
)

// Provider is a device's real VaultysID-backed identity.
type Provider struct {
	vid *vaultysid.VaultysID
}

// LoadOrCreate loads a VaultysID secret from path, generating and
// persisting a new machine identity if it doesn't exist. The secret file
// is written with mode 0600 and its parent directory with 0700. Never
// logged, never transmitted.
func LoadOrCreate(path string) (*Provider, error) {
	if data, err := os.ReadFile(path); err == nil {
		vid, err := vaultysid.FromSecret(data)
		if err != nil {
			return nil, fmt.Errorf("identity: parsing secret from %s: %w", path, err)
		}
		return &Provider{vid: vid}, nil
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("identity: reading key file: %w", err)
	}

	vid, err := vaultysid.GenerateMachine()
	if err != nil {
		return nil, fmt.Errorf("identity: generating VaultysID: %w", err)
	}
	secret, err := vid.GetSecret()
	if err != nil {
		return nil, fmt.Errorf("identity: exporting secret: %w", err)
	}

	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return nil, fmt.Errorf("identity: creating key directory: %w", err)
		}
	}
	if err := os.WriteFile(path, secret, 0o600); err != nil {
		return nil, fmt.Errorf("identity: writing key file: %w", err)
	}

	return &Provider{vid: vid}, nil
}

// LoadDID reads a VaultysID secret from path and returns just its DID —
// read-only, never creates or writes anything, unlike LoadOrCreate. Used to
// check for a locally-known *other* identity (e.g. a real agent-controller's,
// see config.Sensor.AgentIdentityPath) without ever needing that identity's
// signing capability, only its public DID.
func LoadDID(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("identity: reading %s: %w", path, err)
	}
	vid, err := vaultysid.FromSecret(data)
	if err != nil {
		return "", fmt.Errorf("identity: parsing secret from %s: %w", path, err)
	}
	return vid.DID(), nil
}

// DID returns this identity's decentralized identifier
// ("did:vaultys:..."), identical in derivation to the TypeScript
// VaultysId used by the rest of VaultysClaw.
func (p *Provider) DID() string { return p.vid.DID() }

// VaultysID returns the underlying real identity, for driving the
// challenger handshake directly (see internal/vconn).
func (p *Provider) VaultysID() *vaultysid.VaultysID { return p.vid }

// Sign signs data with the real VaultysId challenge-signing scheme
// (SHA256("VAULTYS_SIGN" || data), Ed25519) — the same scheme the
// TypeScript side verifies.
func (p *Provider) Sign(data []byte) ([]byte, error) {
	return p.vid.SignChallenge(data)
}

// Verify checks a signature produced by Sign.
func (p *Provider) Verify(data, signature []byte) bool {
	return p.vid.VerifyChallenge(data, signature) == nil
}
