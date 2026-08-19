// Package intercept is the tier-1 interception point: a CONNECT proxy that
// decides every request locally, from a signed rule set and a signed capability
// grant, with no control-plane round trip
// (docs/PROXY_ARCHITECTURE.md §8 tier 1, §10).
//
// Tier 1 means nothing is decrypted. The only thing visible about a request is
// its destination host and port, from the CONNECT line — which is exactly
// enough for the two primitives the rest of VaultysClaw declares and enforces
// nowhere: the internet_access capability and ResourceLimits.AllowedDomains
// (§7). Anything path- or body-level needs tier 2 and a CA in the host trust
// store, which this package deliberately does not do.
package intercept

import (
	"fmt"
	"net"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
	"github.com/vaultys/VaultysClaw/sdk-go/rules"
)

// Outcome is the verdict for one request, in the shape the audit record needs.
// Every field is here because an admin has to be able to reconstruct *why* from
// the log alone — a governance decision nobody can explain afterwards is not
// worth taking.
type Outcome struct {
	Allowed bool
	// Reason is a stable, human-readable explanation. Populated on a denial and
	// on an ungoverned pass, so "why did this get through" is answerable too.
	Reason string
	// RuleID is the rule that settled it, when a rule did.
	RuleID string
	// GrantingCertID is the certificate that authorized it, when one did.
	GrantingCertID string
	// AttributionMissing records that a subject-scoped rule matched this
	// destination but could not be decided, so the request passed under §5.2's
	// deliberate fail-open. This is the number §5.2.1 requires be countable: a
	// silent pass is the one outcome this design cannot afford.
	AttributionMissing bool
	// RawIPDestination records that the destination was an IP literal, so
	// hostname rules could not apply to it. Audited distinctly because it is a
	// real coverage gap, not a clean decision — see Decide.
	RawIPDestination bool
}

// Config is everything Decide needs beyond the request itself.
type Config struct {
	// Rules is the verified rule set. Nil is a valid, fully-governed
	// configuration: with no rules, every request is referred to the
	// certificate.
	Rules *rules.Set
	// Certs are the certificates held by this interception point, already
	// signature-verified, with the status the control plane most recently
	// asserted. See internal/grant on why status is asserted rather than signed.
	Certs []authz.Certificate
	// MaxStatusAge bounds how long the asserted certificate status may back a
	// decision (§7.1 / §8.2).
	//
	// Zero is the *strictest* setting, not the loosest: no cached status is
	// acceptable at all. Negative means unbounded. That ordering is deliberate
	// and is not a matter of taste — `docs/CERTIFICATE_WEB_OF_TRUST.md` §5.2
	// defines `stapleTtlSeconds: 0` as "force live query every time", the
	// strictest option an admin can pick. An offline decider cannot perform a
	// live query by construction, so the faithful reading of that choice is "no
	// cached status is fresh enough", which under FailClosed denies. Treating 0
	// as "no bound" — the natural Go zero-value reading, and what an earlier
	// version of this code did — would hand the most permissive behaviour to the
	// admin who asked for the least.
	//
	// "Unbounded" therefore has to be spelled out as a negative value, so it can
	// never be arrived at by omission.
	MaxStatusAge time.Duration
	// SyncedAt is when Certs' status was last confirmed by the control plane.
	SyncedAt time.Time
	// FailClosed is what to do once StaleAfter has elapsed: true denies governed
	// requests until the next sync, false continues on the stale set.
	//
	// Note the blast radius this controls. In `system` mode a fail-closed
	// decision affects every workload in scope on the host at once, which is
	// only tenable because §5.2 keeps non-agentic traffic out of scope
	// entirely.
	FailClosed bool
}

// Decide resolves one CONNECT request.
//
// Order matters and follows §10: rules match on the destination first, so a
// subject:any denylist is decided without ever asking who the caller was.
// Attribution is consulted only when a matched rule needs a subject, which is
// what keeps it lazy — attribution may be nil, and a nil attribution never
// turns into an allow by accident, only into an audited miss.
//
// # The IP-literal gap, stated rather than hidden
//
// A CONNECT to a raw IP carries no hostname, so hostname rules cannot match it:
// `CONNECT 104.18.0.1:443` reaches whatever that address serves even with a
// deny rule on `.openai.com`. This is inherent to deciding on the CONNECT line
// alone — the client resolved the name, we only see the result. Decide does not
// pretend otherwise: it evaluates what rules it can, and flags the outcome
// RawIPDestination so the coverage gap is visible in the audit trail instead of
// looking like a clean pass. Closing it needs either IP-literal rules, a deny
// on IP-literal destinations, or tier 2's SNI.
func Decide(cfg Config, dest rules.Destination, attribution *rules.Attribution, now time.Time) Outcome {
	out := Outcome{RawIPDestination: net.ParseIP(dest.Host) != nil}

	if cfg.Rules != nil {
		ruleOutcome := cfg.Rules.Evaluate(dest, attribution)
		out.AttributionMissing = len(ruleOutcome.NeedsSubject) > 0

		switch ruleOutcome.Verdict {
		case rules.VerdictDeny:
			out.RuleID = ruleOutcome.RuleID
			out.Reason = fmt.Sprintf("denied by rule %s", ruleOutcome.RuleID)
			return out
		case rules.VerdictAllow:
			out.Allowed = true
			out.RuleID = ruleOutcome.RuleID
			out.Reason = fmt.Sprintf("allowed by rule %s", ruleOutcome.RuleID)
			return out
		}
	}

	// No rule settled it: the certificate decides.
	if stale, reason := cfg.staleness(now); stale {
		if cfg.FailClosed {
			out.Reason = reason
			return out
		}
		// Continuing on a stale set is a configured choice, but it is never a
		// silent one.
		out.Reason = reason
	}

	resource := dest.String()
	decision := authz.Resolve(
		authz.RequestedAction{Capability: authz.CapInternetAccess, Resource: &resource},
		cfg.Certs,
		now.UnixMilli(),
	)
	if !decision.Allowed {
		out.Reason = decision.Reason
		return out
	}

	// AllowedDomains is a second, independent gate on the same certificate:
	// resolvePermission answers "may this point reach the internet at all",
	// AllowedDomains answers "to which hosts". Enforced here because this is the
	// first and only place in VaultysClaw that can — the field is collected by
	// the admin UI and read by no enforcement code anywhere else (§7).
	if allowed, domains := domainsFor(cfg.Certs, decision.GrantingCertID); domains != nil && !allowed(dest.Host) {
		out.Reason = fmt.Sprintf(
			"host %q is not in the certificate's allowedDomains", dest.Host,
		)
		out.GrantingCertID = decision.GrantingCertID
		return out
	}

	out.Allowed = true
	out.GrantingCertID = decision.GrantingCertID
	if out.Reason == "" {
		out.Reason = fmt.Sprintf("authorized by certificate %s", decision.GrantingCertID)
	}
	return out
}

// staleness reports whether the asserted certificate status has aged past
// MaxStatusAge. See that field on why zero is the strict end and negative is
// unbounded.
func (c Config) staleness(now time.Time) (bool, string) {
	if c.MaxStatusAge < 0 {
		return false, ""
	}

	verb := "continuing on"
	if c.FailClosed {
		verb = "denied on"
	}

	if c.MaxStatusAge == 0 {
		return true, fmt.Sprintf(
			"%s cached certificate status: maxStatusAge is 0, which demands a live status check this interception point cannot perform offline",
			verb,
		)
	}

	age := now.Sub(c.SyncedAt)
	if age <= c.MaxStatusAge {
		return false, ""
	}
	return true, fmt.Sprintf(
		"%s certificate status last confirmed %s ago, past the %s bound",
		verb, age.Truncate(time.Second), c.MaxStatusAge,
	)
}

// domainsFor returns a host predicate for the granting certificate's
// AllowedDomains, and nil when that certificate sets no domain limit.
//
// The returned predicate uses rules.MatchHost, so an entry is an exact hostname
// or a dot-prefixed suffix — the same strict semantics as a rule, and
// deliberately not the detector's substring matching, which would let
// "api.openai.com" in an allowlist authorize "api.openai.com.evil.example".
func domainsFor(certs []authz.Certificate, certID string) (func(string) bool, []string) {
	for _, cert := range certs {
		if cert.ID != certID {
			continue
		}
		if cert.ResourceLimits == nil || len(cert.ResourceLimits.AllowedDomains) == 0 {
			return nil, nil
		}
		domains := cert.ResourceLimits.AllowedDomains
		return func(host string) bool {
			for _, d := range domains {
				if rules.MatchHost(d, host) {
					return true
				}
			}
			return false
		}, domains
	}
	return nil, nil
}
