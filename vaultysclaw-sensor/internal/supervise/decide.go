package supervise

import (
	"errors"
	"fmt"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
	"github.com/vaultys/VaultysClaw/sdk-go/rules"
)

// Mode is how a decision is applied.
type Mode string

const (
	// ModeObserve decides, records, and always permits. The default, and the
	// only mode phase 0 ships: the resource strings this package produces end
	// up inside signed certificates, so they are learned from real traffic
	// before being frozen (docs/HARNESS_SUPERVISOR.md §4).
	ModeObserve Mode = "observe"
	// ModeExplicit refuses anything not covered by a certificate.
	ModeExplicit Mode = "explicit"
)

// Outcome is the verdict for one tool call, in the shape the audit record
// needs. Deliberately the same idea as intercept.Outcome: an admin has to be
// able to reconstruct *why* from the log alone.
type Outcome struct {
	// Allowed is what the harness is actually told. In ModeObserve it is always
	// true — read Governed and WouldDeny to learn what the policy said.
	Allowed bool
	// Reason is a stable, human-readable explanation. Populated on a denial and
	// on an ungoverned pass, so "why did this get through" is answerable too.
	// It is returned to the harness verbatim and therefore reaches the model's
	// context, which is deliberate: a bare failure makes an agent retry-loop, a
	// reasoned one makes it route around.
	Reason string
	// GrantingCertID is the certificate that authorized the call, when one did.
	GrantingCertID string
	// WouldDeny records what ModeExplicit would have decided, so an observe-mode
	// spool answers "what would this policy have broken?" without re-running
	// anything.
	WouldDeny bool
	// Unmapped marks a tool this package has no capability mapping for. A
	// coverage gap, not a decision — countable for the same reason
	// intercept.Outcome.AttributionMissing is (§5.2.1): a silent pass is the one
	// outcome this design cannot afford.
	Unmapped bool
	// NoResource marks a tool that reaches nothing outside the harness's own
	// conversation. Also a pass, but not a gap: nothing here will ever be
	// governed, so counting it as backlog would make the coverage number
	// meaningless. See ErrNoResource.
	NoResource bool
	// FloorRefused marks a denial by the local safety floor rather than by the
	// certificate. Distinguished because the two mean different things to an
	// admin: one is this host's own seatbelt, the other is the ledger.
	FloorRefused bool
	// RuleID is the signed rule that settled the call, when one did. Empty for a
	// floor refusal — the floor is not signed policy and must not be reported as
	// though it were.
	RuleID string
}

// Config is everything Decide needs beyond the call itself.
type Config struct {
	// Mode is observe or explicit.
	Mode Mode
	// Certs are the certificates held by this interception point, already
	// signature-verified, with the status the control plane most recently
	// asserted.
	Certs []authz.Certificate
	// Rules is the verified signed rule set, or nil when none is provisioned.
	// Only its resource half is consulted here; the host half belongs to the
	// intercept role and the two never interact.
	Rules *rules.Set
	// Floor is the local deny-only path list. Nil disables it, which is a
	// deliberate configuration and not a default.
	//
	// It is a *fallback*, not a peer of Rules: see Decide. Once a deployment has
	// signed resource rules the floor stops being the interesting layer, but
	// most deployments will not have them for a while, and a supervisor whose
	// only deny source is one nobody has provisioned yet protects nothing.
	Floor *Floor
	// MaxStatusAge bounds how long the asserted certificate status may back a
	// decision.
	//
	// Zero is the *strictest* setting, not the loosest: no cached status is
	// acceptable at all. Negative means unbounded. This ordering is copied from
	// intercept.Config deliberately — the same knob must not mean opposite
	// things in two roles of one binary. See that type for the full reasoning.
	MaxStatusAge time.Duration
	// SyncedAt is when Certs' status was last confirmed by the control plane.
	SyncedAt time.Time
	// FailClosed is what to do once MaxStatusAge has elapsed: true denies
	// governed calls until the next sync, false continues on the stale set.
	FailClosed bool
}

// Decide is the whole decision, taken locally from signed artefacts with no
// control-plane round trip. It is on the critical path of every tool call, so
// it performs no I/O beyond the floor's in-memory path comparison.
//
// Order is load-bearing and is the tool-call analogue of intercept.Decide's:
//
//  1. **The safety floor first**, before any certificate is consulted — a floor
//     entry is not overridable by a grant, which is the entire point of having
//     one.
//  2. **Unmapped tools pass**, recorded as a coverage gap. A tool this package
//     does not understand has not been judged, and refusing it would be
//     enforcement by ignorance.
//  3. **Staleness**, then the certificate.
//
// Signed resource rules are consulted **before** the floor, and the floor is
// then consulted anyway. The ordering matters and neither half is redundant:
//
//   - A signed rule is real policy, authored by an admin and verified against
//     the pinned anchor, and it can *allow* as well as deny — so it must be able
//     to settle a call the floor would otherwise refuse. An operator who
//     deliberately signed "this agent may read ~/.aws" should get that.
//   - The floor still runs when no rule matched, because it is the only deny
//     source a deployment has before anyone provisions a rule set — which is
//     every deployment today. A supervisor whose sole protection is policy
//     nobody has written yet protects nothing.
//
// So the floor is a fallback that signed policy can override, not a layer
// stacked under it. That is a deliberate weakening of the floor's earlier
// absolute status, and it is the right one: unsigned local config must never be
// able to overrule an admin's signed decision, in either direction.
func Decide(cfg Config, action Action, mapErr error, now time.Time) Outcome {
	permit := func(out Outcome) Outcome {
		// In observe mode the harness is always told yes; WouldDeny carries what
		// the policy actually said.
		out.WouldDeny = !out.Allowed
		if cfg.Mode == ModeObserve {
			out.Allowed = true
		}
		return out
	}

	if errors.Is(mapErr, ErrNoResource) {
		return Outcome{
			Allowed:    true,
			NoResource: true,
			Reason:     fmt.Sprintf("not governed: %s reaches no resource", action.Tool),
		}
	}
	if errors.Is(mapErr, ErrUnmapped) {
		// Always genuinely allowed, in both modes: this is not a judgement that
		// came out permissive, it is the absence of a judgement, and explicit
		// mode must not start refusing tools merely because the mapping table
		// has not caught up. The gap is recorded instead.
		return Outcome{
			Allowed:  true,
			Unmapped: true,
			Reason:   fmt.Sprintf("ungoverned: no capability mapping for tool %q", action.Tool),
		}
	}
	if mapErr != nil {
		// A malformed call — a Read with no path, unparseable arguments. This is
		// a judgement, and it fails closed: a call whose target cannot be
		// determined cannot be checked against a scope.
		return permit(Outcome{Reason: "refused: " + mapErr.Error()})
	}

	if cfg.Rules != nil && action.Resource != "" {
		// Attribution is nil: the supervisor launched the harness, so there is
		// exactly one subject and no socket→PID guess to make. A subject-scoped
		// rule is therefore undecidable here and is reported, not assumed —
		// Store.Validate already refuses to load a set containing one when
		// attribution is unavailable, so reaching this is a configuration bug
		// rather than a routine case.
		out := cfg.Rules.EvaluateResource(action.Resource, nil)
		switch out.Verdict {
		case rules.VerdictDeny:
			return permit(Outcome{RuleID: out.RuleID, Reason: fmt.Sprintf("denied by rule %s", out.RuleID)})
		case rules.VerdictAllow:
			return permit(Outcome{Allowed: true, RuleID: out.RuleID, Reason: fmt.Sprintf("allowed by rule %s", out.RuleID)})
		}
	}

	// The floor always runs, and it is reached only after signed rules have had
	// their say — which is what makes it liftable without making it optional.
	//
	// An admin who wants an agent to read a floor path writes a signed `allow`
	// rule for it, and the block above has already returned by the time we get
	// here. What they must never get is a floor that *disappears* because they
	// wrote some unrelated rule: making the floor step aside once any rule set
	// exists would mean adding "deny exec://docker" silently drops the ~/.ssh
	// protection nobody knew they were relying on. Adding policy must not remove
	// protection.
	if action.Path != "" {
		if refused, why := cfg.Floor.Refuses(action.Path); refused {
			return permit(Outcome{FloorRefused: true, Reason: "refused: " + why})
		}
	}

	if stale, reason := cfg.staleness(now); stale {
		if cfg.FailClosed {
			return permit(Outcome{Reason: reason})
		}
		// Continuing on a stale set is the operator's explicit choice, but it
		// must be visible in the record of every call it decided, not only in a
		// startup log line nobody rereads.
		out := decideFromCerts(cfg, action, now)
		out.Reason = appendNote(out.Reason, reason+"; continuing under failClosed=false")
		return permit(out)
	}

	return permit(decideFromCerts(cfg, action, now))
}

func decideFromCerts(cfg Config, action Action, now time.Time) Outcome {
	decision := authz.Resolve(action.RequestedAction(), cfg.Certs, now.UnixMilli())
	if !decision.Allowed {
		return Outcome{Reason: "denied: " + decision.Reason}
	}
	return Outcome{
		Allowed:        true,
		GrantingCertID: decision.GrantingCertID,
		Reason: fmt.Sprintf("allowed by certificate %s (%s on %s)",
			decision.GrantingCertID, action.Capability, action.Resource),
	}
}

// staleness reports whether the asserted certificate status is too old to back
// a decision. Mirrors intercept.Config.staleness, including the meaning of a
// zero MaxStatusAge.
func (c Config) staleness(now time.Time) (bool, string) {
	if c.MaxStatusAge < 0 {
		return false, ""
	}
	if c.MaxStatusAge == 0 {
		return true, "certificate status unverifiable: maxStatusAgeSeconds is 0, which requires a live status check this offline decider cannot perform"
	}
	if c.SyncedAt.IsZero() {
		return true, "certificate status has never been confirmed by the control plane"
	}
	if age := now.Sub(c.SyncedAt); age > c.MaxStatusAge {
		return true, fmt.Sprintf("certificate status is %s old, beyond the %s bound", age.Truncate(time.Second), c.MaxStatusAge)
	}
	return false, ""
}

func appendNote(reason, note string) string {
	if reason == "" {
		return note
	}
	return reason + " — " + note
}
