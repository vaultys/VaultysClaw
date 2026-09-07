package supervise

import (
	"fmt"
	"sort"
	"strings"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
	"github.com/vaultys/vaultysclaw-sensor/internal/intercept"
)

// The observe-mode reader. Phase 0's deliverable is knowledge, not enforcement
// (docs/HARNESS_SUPERVISOR.md §4): a week of real sessions is run so the
// resource strings can be seen before they are frozen into signed certificates.
// Knowledge needs a reader, and raw JSON lines are not one — this turns a spool
// into the two things an admin actually has to decide:
//
//  1. what scope a certificate would need to cover what really happened, as a
//     CertScope.resourcePattern string they can paste into the issuance form;
//  2. what enforcing it would have broken, and what is not governed at all.

// Report is a summary of one spool.
type Report struct {
	Total      int
	Allowed    int
	WouldDeny  int
	Ungoverned int
	// NotGoverned counts calls that reach nothing a certificate could scope.
	// Reported separately from Ungoverned so the backlog number stays a backlog.
	NotGoverned int
	// Capabilities is one entry per capability seen, most-used first.
	Capabilities []CapabilityReport
	// UngovernedTools is the coverage backlog, sized: tools with no capability
	// mapping, most-frequent first. A tool that reaches no resource at all is
	// deliberately not here — see NotGoverned.
	UngovernedTools []ToolCount
	// WouldDenyReasons is what enforcement would have refused, most-frequent
	// first — the answer to "what would this policy have broken?".
	WouldDenyReasons []ReasonCount
}

// CapabilityReport is what one capability was used for.
type CapabilityReport struct {
	Capability authz.Capability
	Calls      int
	Resources  []string
	Tools      []string
	// SuggestedScope is a CertScope.resourcePattern covering every resource
	// seen, or "" when no single pattern would (see SuggestScope). Resources the
	// safety floor refused are excluded from it — see FloorRefused.
	SuggestedScope string
	// FloorRefused are resources the local floor refused. Reported separately
	// because they are a different kind of finding: not "widen the scope to
	// cover this" but "the agent reached for this, and was stopped".
	FloorRefused []string
}

// ToolCount and ReasonCount are frequency pairs.
type ToolCount struct {
	Tool  string
	Calls int
}

// ReasonCount groups by reason text.
type ReasonCount struct {
	Reason string
	Calls  int
}

// BuildReport summarizes a spool. Events from the intercept role (which carry no
// Tool) are skipped: one file holds both roles' events, and mixing "host:port"
// into a filesystem scope suggestion would produce a pattern that authorizes
// neither cleanly.
func BuildReport(events []intercept.Event) Report {
	var r Report
	byCap := map[string]*CapabilityReport{}
	capResources := map[string]map[string]bool{}
	capTools := map[string]map[string]bool{}
	ungoverned := map[string]int{}
	reasons := map[string]int{}

	for _, e := range events {
		if e.Tool == "" {
			continue // a network event from the intercept role
		}
		r.Total++
		if e.Allowed {
			r.Allowed++
		}
		if e.NoResource {
			r.NotGoverned++
			continue
		}
		if e.Ungoverned {
			r.Ungoverned++
			ungoverned[e.Tool]++
			continue
		}
		if e.WouldDeny || !e.Allowed {
			r.WouldDeny++
			reasons[e.Reason]++
		}
		if e.Capability == "" {
			continue
		}
		cr, ok := byCap[e.Capability]
		if !ok {
			cr = &CapabilityReport{Capability: authz.Capability(e.Capability)}
			byCap[e.Capability] = cr
			capResources[e.Capability] = map[string]bool{}
			capTools[e.Capability] = map[string]bool{}
		}
		cr.Calls++
		if e.Resource != "" {
			// A resource the floor refused is evidence of what to deny, never of
			// what to grant, so it must not drag the scope suggestion wider —
			// or, far more often, collapse it to nothing. One ~/.ssh read in a
			// week of sessions would otherwise poison every file_read
			// suggestion, which is most of what this report is for.
			if e.RuleID == FloorRuleID {
				cr.FloorRefused = append(cr.FloorRefused, e.Resource)
			} else {
				capResources[e.Capability][e.Resource] = true
			}
		}
		capTools[e.Capability][e.Tool] = true
	}

	for name, cr := range byCap {
		cr.FloorRefused = dedupe(cr.FloorRefused)
		cr.Resources = sortedKeys(capResources[name])
		cr.Tools = sortedKeys(capTools[name])
		cr.SuggestedScope = SuggestScope(cr.Resources)
		r.Capabilities = append(r.Capabilities, *cr)
	}
	sort.Slice(r.Capabilities, func(i, j int) bool {
		if r.Capabilities[i].Calls != r.Capabilities[j].Calls {
			return r.Capabilities[i].Calls > r.Capabilities[j].Calls
		}
		return r.Capabilities[i].Capability < r.Capabilities[j].Capability
	})

	for tool, n := range ungoverned {
		r.UngovernedTools = append(r.UngovernedTools, ToolCount{Tool: tool, Calls: n})
	}
	sort.Slice(r.UngovernedTools, func(i, j int) bool {
		if r.UngovernedTools[i].Calls != r.UngovernedTools[j].Calls {
			return r.UngovernedTools[i].Calls > r.UngovernedTools[j].Calls
		}
		return r.UngovernedTools[i].Tool < r.UngovernedTools[j].Tool
	})

	for reason, n := range reasons {
		r.WouldDenyReasons = append(r.WouldDenyReasons, ReasonCount{Reason: reason, Calls: n})
	}
	sort.Slice(r.WouldDenyReasons, func(i, j int) bool {
		if r.WouldDenyReasons[i].Calls != r.WouldDenyReasons[j].Calls {
			return r.WouldDenyReasons[i].Calls > r.WouldDenyReasons[j].Calls
		}
		return r.WouldDenyReasons[i].Reason < r.WouldDenyReasons[j].Reason
	})
	return r
}

// SuggestScope proposes a CertScope.resourcePattern covering every resource,
// or "" when no useful one exists.
//
// The pattern language is deliberately tiny — one trailing "*", matched by
// authz.matchesPattern — so the only thing to compute is a common prefix. Two
// rules make the result safe to paste into a certificate:
//
//   - **The prefix is cut at a separator**, never mid-segment. A raw common
//     prefix of "file:///home/fx/repo" and "file:///home/fx/rest" is
//     "file:///home/fx/re", and "file:///home/fx/re*" would authorize every
//     sibling starting with "re" — the same class of mistake rules.MatchHost
//     exists to avoid on the network side.
//   - **A single resource suggests itself exactly**, with no wildcard: one
//     observed file is evidence for that file, not for its whole directory.
//     Widening is the admin's call to make deliberately, not a default this
//     tool slips into the pattern for them.
func SuggestScope(resources []string) string {
	switch len(resources) {
	case 0:
		return ""
	case 1:
		return resources[0]
	}

	prefix := resources[0]
	for _, r := range resources[1:] {
		prefix = commonPrefix(prefix, r)
		if prefix == "" {
			return ""
		}
	}

	// Cut back to the last separator so the wildcard starts on a boundary.
	cut := strings.LastIndexAny(prefix, "/:")
	if cut < 0 {
		return ""
	}
	prefix = prefix[:cut+1]

	// "file://*" or "exec://*" is a common prefix in name only — it covers
	// everything and is not a scope. Refuse it rather than suggesting a
	// certificate that grants the whole filesystem.
	if strings.HasSuffix(prefix, "://") || prefix == "file:///" {
		return ""
	}
	return prefix + "*"
}

func commonPrefix(a, b string) string {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	i := 0
	for i < n && a[i] == b[i] {
		i++
	}
	return a[:i]
}

func dedupe(in []string) []string {
	seen := map[string]bool{}
	for _, v := range in {
		seen[v] = true
	}
	return sortedKeys(seen)
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// Format renders a Report for a terminal. maxResources bounds how many distinct
// resources are listed per capability; the count is always reported in full, so
// truncation never hides the size of what was seen.
func (r Report) Format(maxResources int) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%d tool calls: %d allowed, %d would be denied under `explicit`, %d ungoverned",
		r.Total, r.Allowed, r.WouldDeny, r.Ungoverned)
	if r.NotGoverned > 0 {
		fmt.Fprintf(&b, ", %d reaching no resource", r.NotGoverned)
	}
	b.WriteString("\n")

	if r.Total == 0 {
		b.WriteString("\nNothing recorded yet. Run a harness under `supervise` in observe mode first.\n")
		return b.String()
	}

	for _, c := range r.Capabilities {
		fmt.Fprintf(&b, "\n%s — %s via %s, %s\n",
			c.Capability, plural(c.Calls, "call"), strings.Join(c.Tools, ", "),
			plural(len(c.Resources), "distinct resource"))
		if c.SuggestedScope != "" {
			fmt.Fprintf(&b, "  suggested scope: %s\n", c.SuggestedScope)
		} else {
			b.WriteString("  suggested scope: none — the resources share no safe common prefix; issue separate certificates\n")
		}
		shown := c.Resources
		if maxResources > 0 && len(shown) > maxResources {
			shown = shown[:maxResources]
		}
		for _, res := range shown {
			fmt.Fprintf(&b, "    %s\n", res)
		}
		if len(shown) < len(c.Resources) {
			fmt.Fprintf(&b, "    … and %d more\n", len(c.Resources)-len(shown))
		}
		if len(c.FloorRefused) > 0 {
			fmt.Fprintf(&b, "  refused by the safety floor, and excluded from the scope above:\n")
			for _, res := range c.FloorRefused {
				fmt.Fprintf(&b, "    %s\n", res)
			}
		}
	}

	if len(r.UngovernedTools) > 0 {
		b.WriteString("\nUngoverned tools — no capability mapping, so these pass undecided:\n")
		for _, t := range r.UngovernedTools {
			fmt.Fprintf(&b, "  %-28s %s\n", t.Tool, plural(t.Calls, "call"))
		}
	}

	if len(r.WouldDenyReasons) > 0 {
		b.WriteString("\nWhat `explicit` mode would have refused:\n")
		for _, rc := range r.WouldDenyReasons {
			fmt.Fprintf(&b, "  %d× %s\n", rc.Calls, rc.Reason)
		}
	}
	return b.String()
}

// EnforcedCapabilities is what this role actually gates today. Anything a tool
// maps to outside this set — and any tool MapToolCall does not map at all —
// passes ungoverned, in `explicit` mode too.
//
// Exported so the startup banner can state it. An operator who assumes the whole
// capability catalogue is being enforced has a false picture of their own
// coverage, and the honest number is the one worth printing.
func EnforcedCapabilities() []string {
	return []string{
		string(CapFileRead), string(CapFileWrite), string(CapCodeExecution),
		string(CapInternetAccess), string(CapKnowledgeSearch), string(CapAPICall), string(CapAgentComm),
	}
}

// UngovernedNotice names what still reaches no decision, so the gap is stated at
// startup rather than discovered from the spool. It must shrink as the mapping
// grows, and saying "nothing" when nothing is left is the point — an operator
// should be able to read this line and believe it.
const UngovernedNotice = "any tool outside the mapping table still passes ungoverned; run `report` to see which ones this deployment actually uses"

func plural(n int, noun string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, noun)
	}
	return fmt.Sprintf("%d %ss", n, noun)
}
