// Package state is everything vaultysclaw-hooks reads from disk: where its
// files live on each OS, its local configuration, and the signed policy
// artefacts a decision is taken from.
//
// There is no daemon and no socket. Every hook invocation reads and verifies
// these files itself, which is what keeps the package portable — a file works
// the same on macOS, Linux and Windows, a unix socket does not.
package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/rules"
	"github.com/vaultys/VaultysClaw/sdk-go/toolgate"
)

// File names inside a state directory. The token and anchor names match
// vaultysclaw-sensor's, so an artefact provisioned for one works for the other.
const (
	ConfigFile   = "config.json"
	AnchorFile   = "control-plane-anchor.json"
	GrantFile    = "grant.token"
	RulesFile    = "rules.token"
	StatusFile   = "status.token"
	SpoolFile    = "audit.jsonl"
	IdentityFile = "identity.key"
	AgentFile    = "agent.json"
)

// Scope is where hooks are installed and where their state lives.
type Scope string

const (
	// ScopeMachine installs into each harness's admin-managed settings and keeps
	// state in a system directory. Needs administrator rights, and is the only
	// scope that resists an agent editing its own configuration.
	ScopeMachine Scope = "machine"
	// ScopeUser installs into the current user's settings. For development and
	// trials: anything running as that user can undo it.
	ScopeUser Scope = "user"
)

// ParseScope validates a --scope flag.
func ParseScope(s string) (Scope, error) {
	switch Scope(strings.ToLower(strings.TrimSpace(s))) {
	case ScopeMachine:
		return ScopeMachine, nil
	case ScopeUser, "":
		return ScopeUser, nil
	}
	return "", fmt.Errorf("unknown scope %q (want machine or user)", s)
}

// DefaultDir is the state directory for a scope on this OS.
func DefaultDir(scope Scope) (string, error) {
	if scope == ScopeMachine {
		switch runtime.GOOS {
		case "darwin":
			return "/Library/Application Support/VaultysClaw/hooks", nil
		case "windows":
			base := os.Getenv("ProgramData")
			if base == "" {
				base = `C:\ProgramData`
			}
			return filepath.Join(base, "VaultysClaw", "hooks"), nil
		default:
			return "/etc/vaultysclaw/hooks", nil
		}
	}
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "vaultysclaw-hooks"), nil
}

// Paths are the files one invocation uses.
type Paths struct {
	Dir    string
	Config string
	Anchor string
	Grant  string
	Rules  string
	// Status is the control plane's last signed cert_status_response for the
	// grant, written by the agent's refresher.
	Status string
	// Identity is this host's VaultysId secret, and Agent the control-plane
	// coordinates written by `enroll`. Both are read by the agent only.
	Identity string
	Agent    string
	// Spool is the audit file this process appends to. It lives outside Dir,
	// because a machine-scope Dir is deliberately not writable by the user the
	// harness runs as — and the hook runs as that user. SpoolDir is the
	// directory the agent drains, which at machine scope holds one file per
	// user.
	Spool    string
	SpoolDir string
}

// PathsFor lays out the files for a scope and state directory.
func PathsFor(scope Scope, dir string) Paths {
	spoolDir := SpoolDir(scope)
	return Paths{
		Dir:      dir,
		Config:   filepath.Join(dir, ConfigFile),
		Anchor:   filepath.Join(dir, AnchorFile),
		Grant:    filepath.Join(dir, GrantFile),
		Rules:    filepath.Join(dir, RulesFile),
		Status:   filepath.Join(dir, StatusFile),
		Identity: filepath.Join(dir, IdentityFile),
		Agent:    filepath.Join(dir, AgentFile),
		Spool:    filepath.Join(spoolDir, spoolName(scope)),
		SpoolDir: spoolDir,
	}
}

// SpoolDir is where audit spools live for a scope.
//
// Machine scope uses one shared, sticky, world-writable directory, so every
// user's hook can append to its own file and the agent — running as a service —
// can drain them all. User scope keeps it in the user's cache.
func SpoolDir(scope Scope) string {
	if scope == ScopeMachine {
		switch runtime.GOOS {
		case "darwin":
			return "/Library/Logs/VaultysClaw/hooks"
		case "windows":
			base := os.Getenv("ProgramData")
			if base == "" {
				base = `C:\ProgramData`
			}
			return filepath.Join(base, "VaultysClaw", "hooks-spool")
		default:
			return "/var/log/vaultysclaw-hooks"
		}
	}
	base, err := os.UserCacheDir()
	if err != nil || base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, "vaultysclaw-hooks")
}

func spoolName(scope Scope) string {
	if scope != ScopeMachine {
		return SpoolFile
	}
	who := "user"
	if u, err := user.Current(); err == nil && u.Username != "" {
		who = u.Username
	}
	// Usernames may carry a domain ("CORP\alice") — keep the file name flat.
	who = strings.NewReplacer("\\", "_", "/", "_", ":", "_").Replace(who)
	return "audit-" + who + ".jsonl"
}

// Mode is how a decision is applied.
type Mode string

const (
	// ModeObserve decides and records, and never blocks. The default.
	ModeObserve Mode = "observe"
	// ModeEnforce blocks what the policy refuses, and fails closed: a decision
	// point this package cannot evaluate is refused, not waved through.
	ModeEnforce Mode = "enforce"
)

// Config is the local, unsigned configuration. Like the safety floor it may
// only make things stricter than the signed policy — nothing here can grant.
type Config struct {
	Mode Mode `json:"mode"`
	// MaxStatusAgeSeconds bounds how long the certificate status may back a
	// decision. Same meaning as everywhere else in VaultysClaw: 0 is the
	// strictest (no cached status is acceptable), negative is unbounded.
	MaxStatusAgeSeconds int `json:"maxStatusAgeSeconds"`
	// FailClosed denies governed calls once the status is stale.
	FailClosed bool `json:"failClosed"`
	// FloorPaths replaces toolgate.DefaultFloorPaths when non-empty.
	FloorPaths []string `json:"floorPaths,omitempty"`
}

// DefaultConfig is what an absent config file means.
//
// Observe mode, and an unbounded status age: until phase 1 there is no agent
// refreshing the status, and a bound would turn every decision into "stale"
// noise in the audit trail.
func DefaultConfig() Config {
	return Config{Mode: ModeObserve, MaxStatusAgeSeconds: -1, FailClosed: true}
}

// LoadConfig reads the config file, or returns DefaultConfig when it is absent.
func LoadConfig(path string) (Config, error) {
	cfg := DefaultConfig()
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return cfg, nil
	}
	if err != nil {
		return cfg, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return DefaultConfig(), fmt.Errorf("state: parsing %s: %w", path, err)
	}
	switch cfg.Mode {
	case ModeObserve, ModeEnforce:
	case "":
		cfg.Mode = ModeObserve
	default:
		// An unknown mode is a typo or a newer config. Enforce is the only
		// reading that cannot widen anything — but it can break a fleet, so it
		// is reported rather than silently chosen.
		return cfg, fmt.Errorf("state: %s: unknown mode %q (want observe or enforce)", path, cfg.Mode)
	}
	return cfg, nil
}

// Policy is the verified signed policy in force.
type Policy struct {
	Certs    []authz.Certificate
	Rules    *rules.Set
	SyncedAt time.Time
	// StatusSource says what SyncedAt rests on: StatusFromCheck when a signed
	// cert_status_response for the current grant is held, StatusFromPush when
	// only the grant file's write time is. Empty when nothing is provisioned.
	StatusSource string
	// AnchorDID is the control plane the artefacts were verified against;
	// empty when no anchor is pinned yet.
	AnchorDID string
}

// Provisioned reports whether any certificate is in force.
func (p Policy) Provisioned() bool { return len(p.Certs) > 0 }

// LoadPolicy reads and verifies the anchor, grant and rule set.
//
// Missing files are not errors: an unprovisioned host has an empty policy,
// which authorizes nothing. A file that is present but does not verify *is* an
// error, and the caller must not fall back to an empty policy in its place —
// an unverifiable rule set dropped silently would drop every deny it carried.
func LoadPolicy(p Paths, now time.Time) (Policy, error) {
	anchor, err := grant.LoadAnchor(p.Anchor)
	if errors.Is(err, grant.ErrNoAnchor) {
		if exists(p.Grant) || exists(p.Rules) {
			return Policy{}, fmt.Errorf("state: signed artefacts present in %s but no control-plane anchor to verify them against", p.Dir)
		}
		return Policy{}, nil
	}
	if err != nil {
		return Policy{}, err
	}

	pol := Policy{AnchorDID: anchor.DID()}

	if token, err := readToken(p.Grant); err == nil {
		body, verr := grant.Verify(anchor.VaultysID(), token, now)
		if verr != nil {
			return Policy{}, fmt.Errorf("state: capability grant %s does not verify against %s: %w", p.Grant, anchor.DID(), verr)
		}
		cert, synced, source, serr := grantStatus(p, anchor, body, now)
		if serr != nil {
			return Policy{}, serr
		}
		pol.Certs = []authz.Certificate{cert}
		pol.SyncedAt = synced
		pol.StatusSource = source
	} else if !errors.Is(err, os.ErrNotExist) {
		return Policy{}, err
	}

	if token, err := readToken(p.Rules); err == nil {
		set, verr := rules.VerifySet(anchor.VaultysID(), token)
		if verr != nil {
			return Policy{}, fmt.Errorf("state: rule set %s does not verify against %s: %w", p.Rules, anchor.DID(), verr)
		}
		// No attribution: the hook runs inside the harness it governs, so there
		// is one subject and no workload vocabulary to match a subject rule on.
		if err := set.Validate(false); err != nil {
			return Policy{}, fmt.Errorf("state: rule set %s: %w", p.Rules, err)
		}
		pol.Rules = set
	} else if !errors.Is(err, os.ErrNotExist) {
		return Policy{}, err
	}
	return pol, nil
}

// What a grant's status rests on (Policy.StatusSource).
const (
	StatusFromCheck = "status-check"
	StatusFromPush  = "push"
)

// grantStatus decides the status a verified grant is enforced with, and since
// when that status is known.
//
// Two sources, in this order:
//
//   - **A signed status response for this exact certificate** (status.token,
//     written by the agent's refresher). Its status and capability list win —
//     that is how a revocation, a kill switch (signed as revoked) or a custom
//     capability deleted from the registry reaches a host. Its CheckedAt is the
//     freshness, being the control plane's own signed clock.
//   - **The push.** The control plane only pushes a grant it considers active,
//     so a grant file is "active as of when it was written". This is the only
//     source before the first check completes, and after a re-issue until the
//     new certificate is checked.
//
// A response that says anything but active is final regardless of a newer
// push: the push carries no status, so it cannot overrule one. An active
// response and a later push agree, and the later of the two is the freshness.
//
// A status file that does not verify is an error, like any other present
// artefact — silently ignoring it would discard a revocation. One for a
// different certificate (the grant was re-issued since) is simply stale.
func grantStatus(p Paths, anchor *grant.Anchor, body *grant.Body, now time.Time) (authz.Certificate, time.Time, string, error) {
	pushed := modTime(p.Grant)
	token, err := readToken(p.Status)
	if errors.Is(err, os.ErrNotExist) {
		return body.ToCertificate(authz.StatusActive), pushed, StatusFromPush, nil
	}
	if err != nil {
		return authz.Certificate{}, time.Time{}, "", err
	}
	resp, err := grant.VerifyStatusResponse(anchor.VaultysID(), token, now, 0)
	if err != nil {
		return authz.Certificate{}, time.Time{}, "", fmt.Errorf("state: status response %s does not verify against %s: %w", p.Status, anchor.DID(), err)
	}
	if resp.CertID != body.CertID || resp.AgentDID != body.AgentDID {
		return body.ToCertificate(authz.StatusActive), pushed, StatusFromPush, nil
	}
	cert := body.ApplyStatus(resp)
	checked := resp.CheckedAtTime()
	if cert.Status == authz.StatusActive && pushed.After(checked) {
		return cert, pushed, StatusFromCheck, nil
	}
	return cert, checked, StatusFromCheck, nil
}

// Floor builds the safety floor: the configured (or default) credential paths,
// plus this package's own artefacts, which are protected unconditionally — a
// gate whose grant and settings the governed agent may rewrite gates nothing.
func Floor(cfg Config, p Paths, extraOwn ...toolgate.FloorPath) *toolgate.Floor {
	paths := cfg.FloorPaths
	if len(paths) == 0 {
		paths = toolgate.DefaultFloorPaths
	}
	own := []toolgate.FloorPath{
		{Path: p.Dir, Reason: "vaultysclaw-hooks' own policy directory"},
		{Path: p.SpoolDir, Reason: "vaultysclaw-hooks' own audit trail"},
	}
	return toolgate.NewFloor(paths, append(own, extraOwn...)...)
}

// ToolgateConfig assembles the decision input.
func ToolgateConfig(cfg Config, pol Policy, floor *toolgate.Floor) toolgate.Config {
	mode := toolgate.ModeObserve
	if cfg.Mode == ModeEnforce {
		mode = toolgate.ModeExplicit
	}
	maxAge := time.Duration(cfg.MaxStatusAgeSeconds) * time.Second
	if cfg.MaxStatusAgeSeconds < 0 {
		maxAge = -1
	}
	return toolgate.Config{
		Mode:         mode,
		Certs:        pol.Certs,
		Rules:        pol.Rules,
		Floor:        floor,
		MaxStatusAge: maxAge,
		SyncedAt:     pol.SyncedAt,
		FailClosed:   cfg.FailClosed,
	}
}

func readToken(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	token := strings.TrimSpace(string(data))
	if token == "" {
		return "", fmt.Errorf("state: %s is empty", path)
	}
	return token, nil
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func modTime(path string) time.Time {
	if info, err := os.Stat(path); err == nil {
		return info.ModTime()
	}
	return time.Time{}
}
