package grant

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
)

// ErrAnchorMismatch means the control plane presented a different identity than
// the one previously pinned on this host. This is never a routine condition:
// either the control plane's identity was legitimately rotated (an admin
// action, which must clear the pin deliberately) or something is impersonating
// it. Enforcement must stop rather than re-pin.
var ErrAnchorMismatch = errors.New("grant: control-plane identity does not match the pinned anchor")

// ErrNoAnchor means no control-plane identity has been pinned yet, so nothing
// can be verified offline. Not an error on a fresh install — it is the state
// before the first successful handshake.
var ErrNoAnchor = errors.New("grant: no pinned control-plane identity")

// Anchor is the pinned public identity of the control plane: the single input,
// besides a token itself, that any offline verification needs.
//
// # Trust establishment is trust-on-first-use, and that is a deliberate choice
//
// The identity is captured from the first completed Challenger handshake and
// pinned; every later connection must present the same one. This is the SSH
// known-hosts model, with the same property: the first connection is trusted
// implicitly, and every subsequent one is verified. That is materially better
// than re-deriving the verification key from each connection (which would make
// offline verification circular — checking a signature with a key the same
// party just handed you) and materially worse than provisioning the anchor out
// of band.
//
// Deployments that want to close the first-connection window configure the
// expected identity ahead of time; PinFromConfig exists for exactly that, and
// an operator who uses it never has a TOFU window at all.
type Anchor struct {
	vid *vaultysid.VaultysID
	raw []byte
}

// anchorFile is the on-disk shape. The DID is stored alongside the raw id
// purely so a human can read the file and tell which control plane a host is
// pinned to; it is never the thing verified against — `id` is.
type anchorFile struct {
	DID string `json:"did"`
	ID  string `json:"id"` // standard base64 of VaultysID.ID()
}

// VaultysID returns the pinned identity, for passing to Verify.
func (a *Anchor) VaultysID() *vaultysid.VaultysID { return a.vid }

// DID returns the pinned control plane's DID, for logging and audit records.
func (a *Anchor) DID() string { return a.vid.DID() }

// LoadAnchor reads a previously pinned identity. Returns ErrNoAnchor if the
// file does not exist, which callers should treat as "not provisioned yet"
// rather than as a failure.
func LoadAnchor(path string) (*Anchor, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNoAnchor
		}
		return nil, fmt.Errorf("grant: reading anchor %s: %w", path, err)
	}

	var af anchorFile
	if err := json.Unmarshal(data, &af); err != nil {
		return nil, fmt.Errorf("grant: parsing anchor %s: %w", path, err)
	}
	raw, err := base64.StdEncoding.DecodeString(af.ID)
	if err != nil {
		return nil, fmt.Errorf("grant: decoding anchor id in %s: %w", path, err)
	}
	return fromRaw(raw)
}

// Pin persists serverID as this host's anchor, or verifies it against an
// already-pinned one.
//
// Called with the identity from a completed handshake. If a different identity
// is already pinned it returns ErrAnchorMismatch and writes nothing — the
// existing pin always wins, so a hostile or misconfigured control plane cannot
// silently replace the key its own grants are checked against.
func Pin(path string, serverID *vaultysid.VaultysID) (*Anchor, error) {
	raw := serverID.ID()
	if len(raw) == 0 {
		return nil, errors.New("grant: refusing to pin an identity with an empty id")
	}

	switch existing, err := LoadAnchor(path); {
	case err == nil:
		if !bytes.Equal(existing.raw, raw) {
			return nil, fmt.Errorf("%w: pinned %s, presented %s",
				ErrAnchorMismatch, existing.DID(), serverID.DID())
		}
		return existing, nil
	case errors.Is(err, ErrNoAnchor):
		// Fall through to first-use pinning.
	default:
		// A corrupt or unreadable anchor is not an invitation to overwrite it.
		return nil, err
	}

	anchor, err := fromRaw(raw)
	if err != nil {
		return nil, err
	}
	if err := writeAnchor(path, anchor); err != nil {
		return nil, err
	}
	return anchor, nil
}

// PinFromConfig pins an identity supplied out of band, as standard base64 of
// VaultysID.ID(). Use this to eliminate the trust-on-first-use window: an
// operator who provisions the anchor with the host never accepts an unverified
// first connection at all.
//
// Like Pin, it refuses to replace a different existing pin.
func PinFromConfig(path, idBase64 string) (*Anchor, error) {
	raw, err := base64.StdEncoding.DecodeString(idBase64)
	if err != nil {
		return nil, fmt.Errorf("grant: decoding configured control-plane id: %w", err)
	}
	vid, err := vaultysid.FromID(raw, nil)
	if err != nil {
		return nil, fmt.Errorf("grant: configured control-plane id is not a VaultysID: %w", err)
	}
	return Pin(path, vid)
}

func fromRaw(raw []byte) (*Anchor, error) {
	vid, err := vaultysid.FromID(raw, nil)
	if err != nil {
		return nil, fmt.Errorf("grant: reconstructing control-plane identity: %w", err)
	}
	return &Anchor{vid: vid, raw: raw}, nil
}

// writeAnchor persists the pin at 0600 under a 0700 directory, matching the
// identity secret's own permissions in internal/identity — the anchor is not
// secret, but it is integrity-critical: an attacker who can rewrite it chooses
// which certificates this host believes.
func writeAnchor(path string, a *Anchor) error {
	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return fmt.Errorf("grant: creating anchor directory: %w", err)
		}
	}
	data, err := json.Marshal(anchorFile{
		DID: a.vid.DID(),
		ID:  base64.StdEncoding.EncodeToString(a.raw),
	})
	if err != nil {
		return fmt.Errorf("grant: encoding anchor: %w", err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("grant: writing anchor %s: %w", path, err)
	}
	return nil
}
