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

	"github.com/vaultys/VaultysClaw/sdk-go/grant"
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

// ResourceRule is a rule about a *resource URI* rather than a network
// destination — "file:///Users/fx/.ssh/*", "exec://docker", "mcp://jira/delete".
//
// A separate type from Rule, and a separate list on Set, deliberately. The two
// are evaluated by different interception points against different inputs:
// Evaluate takes a Destination that a tool call does not have, and
// EvaluateResource takes a URI that a CONNECT line does not have. Folding both
// into one type with two optional halves would leave every reader branching on
// which half is populated, and would admit a rule with both — whose meaning
// nobody has defined. One signed Set still carries both, so an admin's policy
// stays a single artefact with a single signature and version.
type ResourceRule struct {
	ID      string  `msgpack:"id"`
	Subject Subject `msgpack:"subject"`
	// WorkloadID names the governed workload for SubjectWorkload rules, and is
	// empty otherwise.
	WorkloadID string `msgpack:"workloadId,omitempty"`
	// Resources are URI patterns. See MatchResource — exact, or a single
	// trailing "/*" meaning that path and everything beneath it.
	Resources []string `msgpack:"resources"`
	Effect    Effect   `msgpack:"effect"`
}

// Set is a signed rule set as pushed down by the control plane.
type Set struct {
	Version int    `msgpack:"version"`
	Rules   []Rule `msgpack:"rules"`
	// ResourceRules is omitempty so a set carrying none encodes exactly as it
	// did before this field existed — an older signed set still verifies, and a
	// verifier that predates it ignores a field it does not know rather than
	// failing to decode.
	ResourceRules []ResourceRule `msgpack:"resourceRules,omitempty"`
	IssuedAt      int64          `msgpack:"issuedAt"`
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
	for i, r := range s.ResourceRules {
		switch r.Effect {
		case EffectAllow, EffectDeny:
		default:
			return fmt.Errorf("rules: resource rule %d (%q) has unknown effect %q", i, r.ID, r.Effect)
		}
		switch r.Subject {
		case SubjectAny, SubjectAgent:
		case SubjectWorkload:
			if r.WorkloadID == "" {
				return fmt.Errorf("rules: resource rule %d (%q) has subject %q but no workloadId", i, r.ID, r.Subject)
			}
		default:
			return fmt.Errorf("rules: resource rule %d (%q) has unknown subject %q", i, r.ID, r.Subject)
		}
		if len(r.Resources) == 0 {
			return fmt.Errorf("rules: resource rule %d (%q) matches no resources", i, r.ID)
		}
		for _, res := range r.Resources {
			if err := checkResourcePattern(res); err != nil {
				return fmt.Errorf("rules: resource rule %d (%q): %w", i, r.ID, err)
			}
		}
	}
	return nil
}

// checkResourcePattern rejects a pattern the matcher would treat differently
// from how it reads. Refusing at load beats matching surprisingly: an author who
// wrote something the engine reads another way must find out before the set is
// signed, not from an incident.
func checkResourcePattern(pattern string) error {
	p := strings.TrimSpace(pattern)
	if p == "" {
		return fmt.Errorf("has an empty resource pattern")
	}
	if p != pattern {
		return fmt.Errorf("resource pattern %q has surrounding whitespace, which would never match", pattern)
	}
	if !strings.Contains(p, "://") {
		return fmt.Errorf("resource pattern %q is not a URI — expected a scheme like file:// or exec://", pattern)
	}
	if star := strings.IndexByte(p, '*'); star >= 0 {
		// Exactly one form of wildcard, in exactly one position. Anything else —
		// "file:///a/b*", "file:///*/x", "**" — is refused rather than
		// approximated, for the reason MatchHost gives at length: a loose allow
		// rule bypasses the certificate entirely, so incidental matching here is
		// an authorization bug, not a convenience.
		if !strings.HasSuffix(p, "/*") || strings.Count(p, "*") != 1 {
			return fmt.Errorf(
				"resource pattern %q uses a wildcard other than a single trailing \"/*\" — "+
					"the matcher supports an exact URI, or a prefix ending in \"/*\" meaning that path and everything beneath it", pattern)
		}
		if star == len(p)-1 && strings.HasSuffix(p, "://*") {
			return fmt.Errorf("resource pattern %q matches every resource of its scheme; scope it or omit the rule", pattern)
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
	for _, r := range s.ResourceRules {
		if r.Subject.NeedsAttribution() {
			return fmt.Errorf("%w: resource rule %q has subject %q", ErrAttributionUnavailable, r.ID, r.Subject)
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

// EvaluateResource decides a resource URI against the set's resource rules.
//
// The Evaluate twin, with identical precedence — deny-overrides, deny
// short-circuits, an undecidable subject reported rather than assumed. The two
// are deliberately parallel rather than shared: the only thing they would share
// is the loop skeleton, and a single generic version would have to abstract over
// the one line that differs (matching), which is exactly the line where each
// engine's strictness argument lives and where a reader needs to be looking.
//
// The two rule lists never interact. A host rule cannot deny a file, and a
// resource rule cannot deny a hostname — a set that appears to say otherwise is
// one whose author has misread it, which is why the two are separate lists with
// separate matchers rather than one list of half-populated rules.
func (s *Set) EvaluateResource(resource string, attribution *Attribution) Outcome {
	var (
		allowed     bool
		allowRuleID string
		needs       []Subject
		seenNeed    = map[Subject]bool{}
	)

	for _, r := range s.ResourceRules {
		if !r.matchesResource(resource) {
			continue
		}

		applies, decidable := appliesTo(r.Subject, r.WorkloadID, attribution)
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

func (r ResourceRule) matchesResource(resource string) bool {
	for _, pattern := range r.Resources {
		if MatchResource(pattern, resource) {
			return true
		}
	}
	return false
}

// MatchResource matches a resource URI against a rule pattern.
//
// Two forms only, mirroring MatchHost's two:
//
//	"file:///a/b/c.go"   exact match
//	"file:///a/b/*"      that path and everything beneath it
//
// The wildcard form matches the prefix without its trailing slash as well, so a
// rule denying a directory subtree also denies the directory itself — denying
// everything inside a folder but not the folder is not a policy anyone means.
//
// Deliberately stricter than authz.matchesPattern, which backs CertScope and
// allows a "*" anywhere. That looseness is tolerable for a certificate scope:
// scopes only ever *grant*, and the admin authored the exact string. It is wrong
// here, because a rule's EffectAllow bypasses the certificate entirely — so an
// incidental match is an authorization bug, not a convenience. "file:///a/b*"
// would authorize the sibling "file:///a/bc"; this matcher refuses to load such
// a pattern at all (see checkResourcePattern) rather than deciding what it might
// have meant.
//
// Comparison is byte-exact: no case folding, no percent-decoding, no path
// normalization. The caller resolves and encodes a resource into its canonical
// form before it gets here (supervise.ResolvePath and supervise.FileURI do
// exactly that), and doing it twice, differently, in two languages, is how the
// two implementations drift.
func MatchResource(pattern, resource string) bool {
	if !strings.HasSuffix(pattern, "/*") {
		return pattern == resource
	}
	prefix := strings.TrimSuffix(pattern, "*") // keeps the trailing "/"
	if resource == strings.TrimSuffix(prefix, "/") {
		return true
	}
	return strings.HasPrefix(resource, prefix)
}

// appliesTo reports whether a subject covers this attribution, and whether that
// could be determined at all. A subject-scoped rule with no attribution is
// undecidable — not inapplicable.
//
// Shared by both rule kinds: the subject vocabulary is one vocabulary, and two
// copies of this would be two places for it to drift.
func appliesTo(subject Subject, workloadID string, a *Attribution) (applies, decidable bool) {
	if !subject.NeedsAttribution() {
		return true, true
	}
	if a == nil {
		return false, false
	}
	if !a.IsGovernedAgent {
		return false, true
	}
	if subject == SubjectWorkload {
		return a.WorkloadID != "" && a.WorkloadID == workloadID, true
	}
	return true, true
}

// appliesTo reports whether a rule's subject covers this attribution.
// Delegates, so the subject vocabulary has exactly one implementation across
// both rule kinds.
func (r Rule) appliesTo(a *Attribution) (applies, decidable bool) {
	return appliesTo(r.Subject, r.WorkloadID, a)
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
