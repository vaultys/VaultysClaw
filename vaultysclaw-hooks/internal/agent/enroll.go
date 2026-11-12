// Package agent is the background half of vaultysclaw-hooks: it keeps this
// host's signed policy current from the control plane and ships the audit
// spool back. It is never on a decision path — every hook invocation decides
// from the files on disk whether the agent is running or not.
package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// Coordinates are what `enroll` records about the control plane.
type Coordinates struct {
	// URL is the control plane's WebSocket (or http(s)) address.
	URL string `json:"url"`
	// ControlPlaneID is the control plane's VaultysID, base64. It is pinned as
	// the trust anchor at enrolment, so no grant can ever be verified against a
	// key this host learned from the network.
	ControlPlaneID string `json:"controlPlaneId"`
	// Name is how this host appears in the console.
	Name string `json:"name"`
}

// EnrollResult reports what enrolment produced.
type EnrollResult struct {
	DID       string
	AnchorDID string
}

// Enroll pins the control-plane anchor, creates this host's identity, and
// records the coordinates. Re-running it with the same control plane is safe;
// with a different one it fails rather than silently re-pointing the host.
func Enroll(scope state.Scope, p state.Paths, c Coordinates) (EnrollResult, error) {
	c.URL = strings.TrimSpace(c.URL)
	c.ControlPlaneID = strings.TrimSpace(c.ControlPlaneID)
	if c.URL == "" || c.ControlPlaneID == "" {
		return EnrollResult{}, errors.New("agent: --url and --control-plane-id are both required")
	}
	u, err := url.Parse(c.URL)
	if err != nil || u.Host == "" {
		return EnrollResult{}, fmt.Errorf("agent: %q is not an absolute URL", c.URL)
	}
	if c.Name == "" {
		c.Name, _ = os.Hostname()
	}

	if err := os.MkdirAll(p.Dir, dirPerm(scope)); err != nil {
		return EnrollResult{}, err
	}
	anchor, err := grant.PinFromConfig(p.Anchor, c.ControlPlaneID)
	if err != nil {
		return EnrollResult{}, fmt.Errorf("agent: pinning the control-plane anchor: %w", err)
	}
	// grant.Pin writes 0600. At machine scope the hook runs as each user and
	// must read the anchor to verify anything; it is integrity-critical, not
	// secret, and the directory is root-owned.
	if scope == state.ScopeMachine {
		if err := os.Chmod(p.Anchor, 0o644); err != nil {
			return EnrollResult{}, err
		}
	}

	id, err := identity.LoadOrCreate(p.Identity)
	if err != nil {
		return EnrollResult{}, fmt.Errorf("agent: creating this host's identity: %w", err)
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return EnrollResult{}, err
	}
	if err := writeFileAtomic(p.Agent, append(data, '\n'), filePerm(scope)); err != nil {
		return EnrollResult{}, err
	}
	return EnrollResult{DID: id.DID(), AnchorDID: anchor.DID()}, nil
}

// LoadCoordinates reads what enroll wrote.
func LoadCoordinates(p state.Paths) (Coordinates, error) {
	data, err := os.ReadFile(p.Agent)
	if errors.Is(err, os.ErrNotExist) {
		return Coordinates{}, fmt.Errorf("agent: not enrolled (no %s) — run `vaultysclaw-hooks enroll` first", p.Agent)
	}
	if err != nil {
		return Coordinates{}, err
	}
	var c Coordinates
	if err := json.Unmarshal(data, &c); err != nil {
		return Coordinates{}, fmt.Errorf("agent: parsing %s: %w", p.Agent, err)
	}
	return c, nil
}

// Policy files are read by the hook, which runs as each user, so at machine
// scope they are world-readable in a root-owned directory. The identity secret
// is written by identity.LoadOrCreate at 0600 regardless.
func filePerm(scope state.Scope) os.FileMode {
	if scope == state.ScopeMachine {
		return 0o644
	}
	return 0o600
}

func dirPerm(scope state.Scope) os.FileMode {
	if scope == state.ScopeMachine {
		return 0o755
	}
	return 0o700
}

// writeFileAtomic replaces path via a temp file and rename, so a hook reading
// concurrently sees the old file or the new one, never a torn one — a torn
// grant would fail verification and, in enforce mode, refuse every call.
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := dirOf(path)
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(name, perm); err != nil {
		return err
	}
	return os.Rename(name, path)
}

func dirOf(path string) string {
	if i := strings.LastIndexAny(path, `/\`); i >= 0 {
		return path[:i]
	}
	return "."
}
