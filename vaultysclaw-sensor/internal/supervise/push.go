package supervise

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/vconn"
	"github.com/vmihailenco/msgpack/v5"
)

// Receiving an actor_config push (docs/PROXY_ARCHITECTURE.md §12).
//
// # The push is a delivery mechanism, not a trust path
//
// A supervisor provisioned entirely from local token files behaves identically
// to one that received a push, because both go through the same offline
// verification against the pinned anchor. That is the property this file exists
// to preserve, and it splits the payload cleanly in two:
//
//   - **GrantToken and RuleSetToken are signed.** They are written to disk and
//     the existing Store verifies them exactly as it verifies a hand-provisioned
//     file. A forged one fails verification and the previously verified state
//     stays in force.
//   - **KindConfig and Trust are not authenticated by anything.** Whoever can
//     reach the socket chooses their contents.
//
// # The signed path, and the unsigned fallback
//
// `kindConfigToken` carries the same settings with a control-plane signature
// over them, verified offline against the same pinned anchor as everything else.
// When it verifies, the settings are **authoritative in both directions** — an
// admin can relax a host from the console, because a signature is what separates
// their decision from anyone else's. That is the normal path.
//
// The ratchet below is what happens when there is no signature: a control plane
// that predates the field, or a payload whose token did not verify.
//
// # Why the unsigned fallback can only tighten
//
// The obvious implementation — apply the pushed mode and sandbox setting — hands
// anyone who can reach the socket a switch labelled "stop enforcing": push
// `mode: observe, sandbox: off` and the host keeps running, keeps reporting, and
// refuses nothing. That is the defect §9 records in the superseded proxy
// implementation, which "wrote whatever arrived on the socket straight into its
// local database and enforced it".
//
// So the unsigned half is applied as a **ratchet**: it may make this host
// stricter than its local configuration, never looser. An admin can tighten a
// fleet from the console; relaxing one requires touching that host's own config
// file.
//
// That asymmetry is a real operational cost — an admin whose `explicit` mode is
// breaking someone's work cannot lift it remotely — and it is the right trade
// anyway. Relaxing enforcement over an unauthenticated channel *is* the attack,
// and a console button that performs it is the attack with a nicer label. The
// cost is also bounded in a way the alternative is not: the failure mode here is
// "an admin has to SSH somewhere", and the failure mode there is "supervision
// silently stopped and the console still says it is on".
//
// Signing kindConfig removes the whole trade, which is why it is now the primary
// path. This fallback exists only for a control plane that cannot produce one.

// PushedConfig is the subset of a pushed kindConfig this role understands.
// Pointer fields so "absent" and "the zero value" stay distinguishable: an
// absent mode must leave the local one alone, and `observe` is not the same as
// nothing.
// Both tag sets are load-bearing and neither is redundant: the unsigned copy
// arrives as JSON on the socket, and the signed one arrives as the msgpack body
// signCert wrapped. Same fields, two encodings, and a struct carrying only one
// tag set silently decodes the other into zero values — which for a *pointer*
// field means "absent", so the whole configuration would be read as "says
// nothing" and applied as no change at all.
type PushedConfig struct {
	Mode                *string `json:"mode" msgpack:"mode"`
	Sandbox             *string `json:"sandbox" msgpack:"sandbox"`
	MaxStatusAgeSeconds *int    `json:"maxStatusAgeSeconds" msgpack:"maxStatusAgeSeconds"`
}

// Strictness ordering for the two enumerated settings. Higher is stricter, and
// the ratchet takes the maximum of local and pushed.
var (
	modeStrictness    = map[string]int{"observe": 0, "explicit": 1}
	sandboxStrictness = map[string]int{"off": 0, "auto": 1, "require": 2}
)

// Local is this host's own configuration — the floor the ratchet cannot go below.
type Local struct {
	Mode                string
	Sandbox             string
	MaxStatusAgeSeconds int
}

// Applied is the effective configuration after a push, plus what the ratchet
// refused.
//
// The Local fields are what the host *should* now be running. Which of them it
// can actually adopt without a restart is a separate question, answered by
// PushedMode/PushedMaxStatusAge (live) and NeedsRestart (not). Refusals are returned rather than logged here so the caller decides
// how loudly to surface them; they must be surfaced somewhere, because a push
// that silently did not take effect is indistinguishable from one that did.
type Applied struct {
	Local
	// Changed lists settings a *signed* push altered, in either direction.
	Changed []string
	// Tightened lists settings an *unsigned* push made stricter.
	Tightened []string
	// Refused lists settings the push tried to loosen and was denied.
	Refused []string

	// modeChanged / ageChanged record whether the corresponding Local field
	// differs from what the host was running, so the caller can install exactly
	// the settings that changed rather than re-applying all of them and
	// reporting churn that did not happen.
	modeChanged     bool
	ageChanged      bool
	sandboxChanged  bool
	previousSandbox string
}

// PushedMode is the new mode when the push changed it, nil otherwise. Mode is
// read per decision, so installing it takes effect on the next tool call.
func (a Applied) PushedMode() *string {
	if !a.modeChanged {
		return nil
	}
	m := a.Mode
	return &m
}

// PushedMaxStatusAge is the new staleness bound when the push changed it, nil
// otherwise. Read per decision, like the mode.
func (a Applied) PushedMaxStatusAge() *int {
	if !a.ageChanged {
		return nil
	}
	v := a.MaxStatusAgeSeconds
	return &v
}

// NeedsRestart lists the settings that cannot take effect until the harness is
// launched again.
//
// Only OS confinement is ever here, and not for want of trying: a seatbelt
// profile is applied to a process at exec time, and a running process cannot be
// re-confined. The kernel-enforced half of a `deny file://…` rule is compiled
// into that same profile and waits with it — while the rule itself is already
// live at the tool boundary, which is why this is worth naming precisely rather
// than telling an operator that "settings" changed.
func (a Applied) NeedsRestart() []string {
	if !a.sandboxChanged {
		return nil
	}
	return []string{"sandbox " + a.previousSandbox + " → " + a.Sandbox}
}

// ApplyPushedConfig ratchets local towards pushed, never away from it.
func ApplyPushedConfig(local Local, raw json.RawMessage) (Applied, error) {
	out := Applied{Local: local}
	if len(raw) == 0 {
		return out, nil
	}
	var pushed PushedConfig
	if err := json.Unmarshal(raw, &pushed); err != nil {
		// Refuse the whole thing rather than apply the fields that happened to
		// parse: half a configuration is one nobody authored.
		return out, fmt.Errorf("supervise: pushed kindConfig could not be parsed: %w", err)
	}

	if pushed.Mode != nil {
		out.Mode, out.Tightened, out.Refused = ratchetEnum(
			"mode", local.Mode, *pushed.Mode, modeStrictness, out.Tightened, out.Refused)
	}
	if pushed.Sandbox != nil {
		out.Sandbox, out.Tightened, out.Refused = ratchetEnum(
			"sandbox", local.Sandbox, *pushed.Sandbox, sandboxStrictness, out.Tightened, out.Refused)
	}
	out.markChanges(local)
	if pushed.MaxStatusAgeSeconds != nil {
		if stricter := statusAgeStricter(local.MaxStatusAgeSeconds, *pushed.MaxStatusAgeSeconds); stricter {
			out.MaxStatusAgeSeconds = *pushed.MaxStatusAgeSeconds
			out.Tightened = append(out.Tightened,
				fmt.Sprintf("maxStatusAgeSeconds %d → %d", local.MaxStatusAgeSeconds, *pushed.MaxStatusAgeSeconds))
		} else if *pushed.MaxStatusAgeSeconds != local.MaxStatusAgeSeconds {
			out.Refused = append(out.Refused,
				fmt.Sprintf("maxStatusAgeSeconds %d (would loosen the local %d)", *pushed.MaxStatusAgeSeconds, local.MaxStatusAgeSeconds))
		}
	}
	return out, nil
}

func ratchetEnum(name, local, pushed string, order map[string]int, tightened, refused []string) (string, []string, []string) {
	pushedRank, known := order[pushed]
	if !known {
		// An unrecognised value is not a reason to change anything. It could be
		// a newer, stricter setting this binary does not know — but guessing
		// which direction it points is exactly the guess that must not be made.
		return local, tightened, append(refused, fmt.Sprintf("%s %q (unrecognised)", name, pushed))
	}
	if pushedRank > order[local] {
		return pushed, append(tightened, fmt.Sprintf("%s %s → %s", name, local, pushed)), refused
	}
	if pushed != local {
		return local, tightened, append(refused, fmt.Sprintf("%s %q (would loosen the local %q)", name, pushed, local))
	}
	return local, tightened, refused
}

// statusAgeStricter reports whether pushed is a stricter staleness bound than
// local.
//
// The ordering is not numeric, and this is the third place in this codebase that
// has to say so: 0 means "no cached status is acceptable" and is the *strictest*
// value; a negative value means unbounded and is the loosest; between two
// positives, smaller is stricter. Treating these as plain numbers would make 0
// the most permissive setting, which is how an admin asking for maximum rigor
// ends up with maximum laxity.
func statusAgeStricter(local, pushed int) bool {
	rank := func(v int) int {
		switch {
		case v < 0:
			return 2 // unbounded — loosest
		case v == 0:
			return 0 // strictest
		default:
			return 1
		}
	}
	if rank(pushed) != rank(local) {
		return rank(pushed) < rank(local)
	}
	// Both positive: a smaller bound is stricter. Both zero or both negative:
	// identical, so not stricter.
	return rank(pushed) == 1 && pushed < local
}

// WriteArtefacts persists the signed half of a push so the Store picks it up on
// its next reload.
//
// Written to the same paths a hand-provisioned deployment uses, deliberately:
// one verification path serves both, and there is no "pushed" state that behaves
// differently from a file someone placed there. A nil token clears nothing — the
// control plane sends null when it has nothing to give (no active certificate,
// no rules), and erasing a working local artefact because an unauthenticated
// message said nothing would be a denial of service anyone on the socket could
// perform.
func WriteArtefacts(payload vconn.ActorConfigPayload, grantPath, ruleSetPath string) error {
	if payload.GrantToken != nil {
		if err := writeToken(grantPath, *payload.GrantToken); err != nil {
			return err
		}
	}
	if payload.RuleSetToken != nil {
		if err := writeToken(ruleSetPath, *payload.RuleSetToken); err != nil {
			return err
		}
	}
	return nil
}

// writeToken writes atomically: a torn artefact would fail verification on the
// next reload and take the previously working policy down with it.
func writeToken(path, token string) error {
	if path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("supervise: preparing %s: %w", path, err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".push-*")
	if err != nil {
		return fmt.Errorf("supervise: writing %s: %w", path, err)
	}
	tmpName := tmp.Name()
	if _, err := tmp.WriteString(token); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return fmt.Errorf("supervise: writing %s: %w", path, err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Chmod(tmpName, 0o600); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("supervise: replacing %s: %w", path, err)
	}
	return nil
}

// VerifiedConfig verifies a signed kindConfig against the pinned anchor and
// returns the settings it carries.
//
// A token that does not verify is an error, never a fallback to the unsigned
// copy: the two are indistinguishable in content, so quietly accepting the
// unsigned one after a signature failure would make forging a config no harder
// than corrupting a byte of the real one.
func VerifiedConfig(anchor *grant.Anchor, token string) (PushedConfig, error) {
	raw, err := grant.Open(anchor.VaultysID(), token)
	if err != nil {
		return PushedConfig{}, fmt.Errorf("supervise: the pushed kindConfig failed signature verification: %w", err)
	}
	// grant.Open returns the msgpack body signCert wrapped. The control plane
	// signs the same object it sends as plain JSON, so the field names match —
	// but the encoding does not, which is why this decodes msgpack rather than
	// reusing ApplyPushedConfig's json.Unmarshal.
	var cfg PushedConfig
	if err := msgpack.Unmarshal(raw, &cfg); err != nil {
		return PushedConfig{}, fmt.Errorf("supervise: decoding the signed kindConfig: %w", err)
	}
	return cfg, nil
}

// ApplyVerifiedConfig applies a *signed* configuration, in either direction.
//
// No ratchet: the signature already answered the question the ratchet exists to
// answer without one. Absent fields still leave the local value alone, since a
// config that says nothing about a setting is not a config that sets it to zero.
func ApplyVerifiedConfig(local Local, cfg PushedConfig) Applied {
	out := Applied{Local: local}
	if cfg.Mode != nil && *cfg.Mode != local.Mode {
		out.Mode = *cfg.Mode
		out.Changed = append(out.Changed, fmt.Sprintf("mode %s → %s", local.Mode, *cfg.Mode))
	}
	if cfg.Sandbox != nil && *cfg.Sandbox != local.Sandbox {
		out.Sandbox = *cfg.Sandbox
		out.Changed = append(out.Changed, fmt.Sprintf("sandbox %s → %s", local.Sandbox, *cfg.Sandbox))
	}
	if cfg.MaxStatusAgeSeconds != nil && *cfg.MaxStatusAgeSeconds != local.MaxStatusAgeSeconds {
		out.MaxStatusAgeSeconds = *cfg.MaxStatusAgeSeconds
		out.Changed = append(out.Changed,
			fmt.Sprintf("maxStatusAgeSeconds %d → %d", local.MaxStatusAgeSeconds, *cfg.MaxStatusAgeSeconds))
	}
	out.markChanges(local)
	return out
}

// markChanges records which fields ended up differing from what the host was
// running. Derived from the result rather than tracked per branch so the two
// apply paths — ratcheted and signed — cannot disagree about what changed.
func (a *Applied) markChanges(local Local) {
	a.modeChanged = a.Mode != local.Mode
	a.ageChanged = a.MaxStatusAgeSeconds != local.MaxStatusAgeSeconds
	a.sandboxChanged = a.Sandbox != local.Sandbox
	a.previousSandbox = local.Sandbox
}
