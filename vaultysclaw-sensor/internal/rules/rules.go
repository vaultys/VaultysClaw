// Package rules evaluates an admin-authored, control-plane-signed rule set
// against a destination, deciding whether a request is refused outright,
// allowed outright, or referred to the certificate for a decision.
//
// # Why rules exist alongside certificates
//
// A certificate says what an interception point may permit. Some policy is not
// expressible that way: "nothing on this host may reach openai.com" is a
// destination rule, not a capability grant, and it must hold for every process
// whether or not a classifier ever identified it (docs/PROXY_ARCHITECTURE.md
// §5.2). So rules carry authorization semantics of their own — which is exactly
// why they are signed, per §5.2.0: unsigned pushed config defining
// authorization was the central flaw of the earlier proxy implementation.
//
// # Subjects, and what this package does not do
//
// A rule declares whom it applies to. `any` needs no attribution and is
// decidable from the destination alone. `agent` and `workload` need to know
// which process made the request, which only the observe role can answer — so
// this package does not resolve subjects, it reports that a rule needs one
// (NeedsSubject) and lets the caller supply it. That keeps attribution lazy: a
// rule set of `any` rules never triggers a socket lookup at all.
package rules

import (
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/vaultys/vaultysclaw-sensor/internal/grant"
)

// Subject is whom a rule applies to.
type Subject string

const (
	// SubjectAny applies to every process on the host. Decidable from the
	// destination alone, and therefore cannot be evaded by evading
	// classification.
	SubjectAny Subject = "any"
	// SubjectAgent applies only to processes classified as agent workloads and
	// placed in scope by an admin. Requires attribution.
	SubjectAgent Subject = "agent"
	// SubjectWorkload applies to one specific governed workload, named by
	// Rule.WorkloadID. Requires attribution.
	SubjectWorkload Subject = "workload"
)

// NeedsAttribution reports whether deciding a rule with this subject requires
// knowing which process made the request.
func (s Subject) NeedsAttribution() bool {
	return s == SubjectAgent || s == SubjectWorkload
}

// Effect is what a matching rule does.
type Effect string

const (
	// EffectDeny refuses the request without consulting any certificate. Wins
	// over EffectAllow whenever both match — see Evaluate.
	EffectDeny Effect = "deny"
	// EffectAllow permits the request without consulting any certificate: an
	// explicit whitelist entry.
	EffectAllow Effect = "allow"
)

// Rule is one admin-authored entry.
type Rule struct {
	ID      string  `msgpack:"id"`
	Subject Subject `msgpack:"subject"`
	// WorkloadID names the governed workload for SubjectWorkload rules, and is
	// empty otherwise.
	WorkloadID string `msgpack:"workloadId,omitempty"`
	// Hosts are destination patterns: an exact hostname, or a dot-prefixed
	// suffix such as ".openai.com". See MatchHost — deliberately stricter than
	// the detector's host matching.
	Hosts []string `msgpack:"hosts"`
	// Ports restricts the rule to these destination ports. Empty means any
	// port.
	Ports  []int  `msgpack:"ports,omitempty"`
	Effect Effect `msgpack:"effect"`
}

// Set is a signed rule set as pushed down by the control plane.
type Set struct {
	Version  int    `msgpack:"version"`
	Rules    []Rule `msgpack:"rules"`
	IssuedAt int64  `msgpack:"issuedAt"`
}

// Verdict is what Evaluate concluded.
type Verdict string

const (
	// VerdictDeny — an explicit deny rule matched. Refuse; no certificate is
	// consulted.
	VerdictDeny Verdict = "deny"
	// VerdictAllow — an explicit allow rule matched and no deny rule did.
	// Permit; no certificate is consulted.
	VerdictAllow Verdict = "allow"
	// VerdictGovern — no rule settled it. The certificate decides (for egress,
	// internet_access plus ResourceLimits.AllowedDomains).
	VerdictGovern Verdict = "govern"
)

// Outcome is Evaluate's result.
type Outcome struct {
	Verdict Verdict
	// RuleID is the rule that produced a Deny or Allow verdict, for the audit
	// record. Empty for VerdictGovern.
	RuleID string
	// NeedsSubject lists the subjects of rules that matched this destination but
	// could not be decided because no attribution was supplied. When non-empty
	// the caller may retry with a subject; passing none is a deliberate
	// fail-open (§5.2) and must be audited as an attribution miss, never as a
	// clean pass.
	NeedsSubject []Subject
}

// Destination is the target of a request being evaluated. For a tier-1 CONNECT
// proxy this is exactly what the CONNECT line carries and nothing more.
type Destination struct {
	Host string
	Port int
}

// String renders the destination as "host:port" — the canonical resource form
// used in certificate scopes and audit records, so a scope of
// `resource: "api.openai.com:443"` matches what the interception point reports.
func (d Destination) String() string {
	return net.JoinHostPort(d.Host, strconv.Itoa(d.Port))
}

// Attribution is what the observe role resolved about the calling process, or
// nil when it could not resolve one.
type Attribution struct {
	// IsGovernedAgent is true only for a workload an admin actually placed in
	// scope (§5.2.2's Governed state) — not merely one the classifier flagged.
	IsGovernedAgent bool
	// WorkloadID identifies the governed workload, for SubjectWorkload rules.
	WorkloadID string
}

var (
	// ErrUnsignedSet means a rule set failed signature verification and must
	// not be used. There is no degraded mode: an unverifiable rule set is
	// indistinguishable from an attacker-supplied one.
	ErrUnsignedSet = errors.New("rules: rule set signature verification failed")
	// ErrAttributionUnavailable means the rule set contains subject-scoped
	// rules but this deployment cannot resolve subjects. Returned by Validate at
	// load time, deliberately: an admin who wrote `subject: agent` rules and
	// deployed somewhere they can never match would otherwise believe they were
	// enforcing something. Refusing loudly at load beats failing open silently
	// on every request.
	ErrAttributionUnavailable = errors.New("rules: rule set needs attribution, which this deployment cannot provide")
)

// VerifySet decodes and validates a signed rule set, carried in the same
// packcert envelope as a capability grant (§5.2.0). Fully offline — the only
// input beyond the token is the pinned control-plane public key.
func VerifySet(serverID *vaultysid.VaultysID, token string) (*Set, error) {
	raw, err := grant.Open(serverID, token)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnsignedSet, err)
	}

	var set Set
	if err := msgpack.Unmarshal(raw, &set); err != nil {
		return nil, fmt.Errorf("rules: decoding rule set: %w", err)
	}
	if err := set.check(); err != nil {
		return nil, err
	}
	return &set, nil
}

// check rejects structurally invalid rules. A rule the engine cannot interpret
// is never skipped silently: skipping a deny rule would widen access.
func (s *Set) check() error {
	for i, r := range s.Rules {
		switch r.Effect {
		case EffectAllow, EffectDeny:
		default:
			return fmt.Errorf("rules: rule %d (%q) has unknown effect %q", i, r.ID, r.Effect)
		}
		switch r.Subject {
		case SubjectAny, SubjectAgent:
		case SubjectWorkload:
			if r.WorkloadID == "" {
				return fmt.Errorf("rules: rule %d (%q) has subject %q but no workloadId", i, r.ID, r.Subject)
			}
		default:
			return fmt.Errorf("rules: rule %d (%q) has unknown subject %q", i, r.ID, r.Subject)
		}
		if len(r.Hosts) == 0 {
			return fmt.Errorf("rules: rule %d (%q) matches no hosts", i, r.ID)
		}
		for _, h := range r.Hosts {
			if strings.TrimSpace(h) == "" || h == "." {
				return fmt.Errorf("rules: rule %d (%q) has an empty host pattern", i, r.ID)
			}
		}
	}
	return nil
}

// Validate reports whether this set can be enforced in a deployment whose
// attribution availability is attributionAvailable. See
// ErrAttributionUnavailable for why this is a load-time failure.
func (s *Set) Validate(attributionAvailable bool) error {
	if attributionAvailable {
		return nil
	}
	for _, r := range s.Rules {
		if r.Subject.NeedsAttribution() {
			return fmt.Errorf("%w: rule %q has subject %q", ErrAttributionUnavailable, r.ID, r.Subject)
		}
	}
	return nil
}

// Evaluate decides dest against the set.
//
// attribution may be nil when none was resolved, or when the caller has not
// looked yet — Outcome.NeedsSubject then reports that looking would change the
// answer.
//
// Precedence is deny-overrides: every matching rule is considered and a single
// deny beats any number of allows, regardless of position in the set. Without
// that, rule order would silently decide security outcomes — the same class of
// defect as the earlier implementation's first-match-wins globbing.
func (s *Set) Evaluate(dest Destination, attribution *Attribution) Outcome {
	var (
		allowed     bool
		allowRuleID string
		needs       []Subject
		seenNeed    = map[Subject]bool{}
	)

	for _, r := range s.Rules {
		if !r.matchesDestination(dest) {
			continue
		}

		applies, decidable := r.appliesTo(attribution)
		if !decidable {
			if !seenNeed[r.Subject] {
				seenNeed[r.Subject] = true
				needs = append(needs, r.Subject)
			}
			continue
		}
		if !applies {
			continue
		}

		// Deny short-circuits: nothing later in the set can restore access, so
		// there is no reason to keep looking.
		if r.Effect == EffectDeny {
			return Outcome{Verdict: VerdictDeny, RuleID: r.ID}
		}
		if !allowed {
			allowed = true
			allowRuleID = r.ID
		}
	}

	if allowed {
		return Outcome{Verdict: VerdictAllow, RuleID: allowRuleID, NeedsSubject: needs}
	}
	return Outcome{Verdict: VerdictGovern, NeedsSubject: needs}
}

// appliesTo reports whether a rule's subject covers this attribution, and
// whether that could be determined at all. A subject-scoped rule with no
// attribution is undecidable — not inapplicable.
func (r Rule) appliesTo(a *Attribution) (applies, decidable bool) {
	if !r.Subject.NeedsAttribution() {
		return true, true
	}
	if a == nil {
		return false, false
	}
	switch r.Subject {
	case SubjectAgent:
		return a.IsGovernedAgent, true
	case SubjectWorkload:
		return a.IsGovernedAgent && a.WorkloadID == r.WorkloadID, true
	}
	return false, true
}

func (r Rule) matchesDestination(dest Destination) bool {
	if len(r.Ports) > 0 {
		var ok bool
		for _, p := range r.Ports {
			if p == dest.Port {
				ok = true
				break
			}
		}
		if !ok {
			return false
		}
	}
	for _, pattern := range r.Hosts {
		if MatchHost(pattern, dest.Host) {
			return true
		}
	}
	return false
}

// MatchHost matches a destination host against a rule pattern.
//
// Two forms only:
//
//	"api.openai.com"   exact match, case-insensitive
//	".openai.com"      any subdomain: matches "api.openai.com", not "openai.com"
//
// Deliberately stricter than internal/detector's matchProviderHost, which also
// does bare-substring matching. That looseness is right for detection — a
// heuristic feeding a confidence score, where a near-miss costs a false
// positive an admin can see. It is wrong for enforcement in both directions: an
// allow rule for "api.openai.com" would match the attacker-controlled
// "api.openai.com.evil.example", and a deny rule for "openai.com" would match
// the unrelated "notopenai.com". Enforcement matching must be exact or
// explicitly hierarchical, never incidental.
func MatchHost(pattern, host string) bool {
	p := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(pattern), "."))
	h := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(host), "."))
	if p == "" || h == "" || p == "." {
		return false
	}
	if strings.HasPrefix(p, ".") {
		return strings.HasSuffix(h, p)
	}
	return h == p
}
