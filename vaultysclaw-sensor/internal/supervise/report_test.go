package supervise

import (
	"strings"
	"testing"

	"github.com/vaultys/vaultysclaw-sensor/internal/intercept"
)

func TestSuggestScopeCutsAtASeparator(t *testing.T) {
	// The raw common prefix here is "file:///home/fx/re", and suggesting
	// "file:///home/fx/re*" would authorize every sibling starting with "re" —
	// the same class of mistake rules.MatchHost exists to prevent.
	got := SuggestScope([]string{
		"file:///home/fx/repo/a.go",
		"file:///home/fx/rest/b.go",
	})
	if got != "file:///home/fx/*" {
		t.Errorf("SuggestScope = %q, want the prefix cut back to the last separator", got)
	}
}

func TestSuggestScopeForOneResourceDoesNotWiden(t *testing.T) {
	// One observed file is evidence for that file, not for its directory.
	// Widening is a deliberate admin decision, not a default this tool slips in.
	got := SuggestScope([]string{"file:///home/fx/repo/a.go"})
	if got != "file:///home/fx/repo/a.go" {
		t.Errorf("SuggestScope = %q, want the exact resource with no wildcard", got)
	}
}

func TestSuggestScopeRefusesToProposeEverything(t *testing.T) {
	// A "common prefix" that is only the scheme covers the whole filesystem. A
	// certificate scoped to that is an unscoped certificate with extra steps.
	for _, resources := range [][]string{
		{"file:///a/x", "file:///b/y"},
		{"exec://git", "exec://npm"},
		{"file:///a/x", "exec://git"},
	} {
		if got := SuggestScope(resources); got != "" {
			t.Errorf("SuggestScope(%v) = %q, want no suggestion", resources, got)
		}
	}
}

func TestBuildReportAnswersWhatScopeIsNeeded(t *testing.T) {
	events := []intercept.Event{
		{Tool: "Read", Capability: "file_read", Resource: "file:///r/a.go", Allowed: true, WouldDeny: true, Reason: "denied: no cert"},
		{Tool: "Grep", Capability: "file_read", Resource: "file:///r/b.go", Allowed: true, WouldDeny: true, Reason: "denied: no cert"},
		{Tool: "Bash", Capability: "code_execution", Resource: "exec://git", Allowed: true},
		{Tool: "WebFetch", Allowed: true, Ungoverned: true},
		{Tool: "WebFetch", Allowed: true, Ungoverned: true},
		// An intercept-role event in the same file: one spool holds both roles,
		// and a host:port must never leak into a filesystem scope suggestion.
		{Resource: "api.openai.com:443", Allowed: true},
	}
	r := BuildReport(events)

	if r.Total != 5 {
		t.Errorf("Total = %d, want 5 — the network event must not be counted as a tool call", r.Total)
	}
	if r.Ungoverned != 2 || r.WouldDeny != 2 {
		t.Errorf("Ungoverned = %d, WouldDeny = %d; want 2 and 2", r.Ungoverned, r.WouldDeny)
	}
	if len(r.Capabilities) != 2 || r.Capabilities[0].Capability != "file_read" {
		t.Fatalf("capabilities = %+v, want file_read first (most calls)", r.Capabilities)
	}
	if got := r.Capabilities[0].SuggestedScope; got != "file:///r/*" {
		t.Errorf("suggested scope = %q, want file:///r/*", got)
	}
	if got := strings.Join(r.Capabilities[0].Tools, ","); got != "Grep,Read" {
		t.Errorf("tools = %q, want both tools that produced the capability", got)
	}
	if len(r.UngovernedTools) != 1 || r.UngovernedTools[0].Calls != 2 {
		t.Errorf("ungoverned tools = %+v, want WebFetch×2 — the phase-3 backlog, sized", r.UngovernedTools)
	}
	if len(r.WouldDenyReasons) != 1 || r.WouldDenyReasons[0].Calls != 2 {
		t.Errorf("wouldDeny reasons = %+v, want the two denials grouped", r.WouldDenyReasons)
	}
}

func TestBuildReportCountsADenialInObserveAndExplicitAlike(t *testing.T) {
	// In observe mode a refusal is Allowed=true + WouldDeny=true; in explicit it
	// is Allowed=false. Both are "what enforcement refuses" and must count the
	// same, or a report read after switching modes would look like a regression.
	observe := BuildReport([]intercept.Event{{Tool: "Read", Capability: "file_read", Resource: "file:///x", Allowed: true, WouldDeny: true, Reason: "denied: no cert"}})
	explicit := BuildReport([]intercept.Event{{Tool: "Read", Capability: "file_read", Resource: "file:///x", Allowed: false, Reason: "denied: no cert"}})
	if observe.WouldDeny != explicit.WouldDeny {
		t.Errorf("observe %d vs explicit %d refusals counted", observe.WouldDeny, explicit.WouldDeny)
	}
}

func TestFormatReportsTheFullCountEvenWhenTruncating(t *testing.T) {
	var events []intercept.Event
	for _, r := range []string{"file:///r/a", "file:///r/b", "file:///r/c"} {
		events = append(events, intercept.Event{Tool: "Read", Capability: "file_read", Resource: r, Allowed: true})
	}
	out := BuildReport(events).Format(1)
	if !strings.Contains(out, "3 distinct resources") {
		t.Errorf("the full count must survive truncation; got:\n%s", out)
	}
	if !strings.Contains(out, "and 2 more") {
		t.Errorf("truncation must be visible; got:\n%s", out)
	}
}

func TestFormatEmptySpoolSaysSo(t *testing.T) {
	out := BuildReport(nil).Format(10)
	if !strings.Contains(out, "Nothing recorded yet") {
		t.Errorf("an empty spool must say so rather than printing an empty table; got:\n%s", out)
	}
}

func TestFloorRefusedResourcesDoNotPoisonTheScopeSuggestion(t *testing.T) {
	// The case that made this feature dead on arrival: one ~/.ssh read in a week
	// of sessions shares no prefix with the repo, so including it collapsed
	// every file_read suggestion to "none". A refused resource is evidence of
	// what to deny, never of what to grant.
	events := []intercept.Event{
		{Tool: "Read", Capability: "file_read", Resource: "file:///r/src/a.go", Allowed: true},
		{Tool: "Read", Capability: "file_read", Resource: "file:///r/src/b.go", Allowed: true},
		{Tool: "Read", Capability: "file_read", Resource: "file:///home/fx/.ssh/id", Allowed: true,
			WouldDeny: true, RuleID: FloorRuleID, Reason: "refused: on the safety floor"},
	}
	r := BuildReport(events)
	cap := r.Capabilities[0]

	if cap.SuggestedScope != "file:///r/src/*" {
		t.Errorf("suggested scope = %q, want the repo prefix with the refused path excluded", cap.SuggestedScope)
	}
	if len(cap.FloorRefused) != 1 || cap.FloorRefused[0] != "file:///home/fx/.ssh/id" {
		t.Errorf("FloorRefused = %v, want the refused path reported separately — excluded is not the same as hidden", cap.FloorRefused)
	}
	if cap.Calls != 3 {
		t.Errorf("Calls = %d, want all 3 — the refusal still happened", cap.Calls)
	}
	out := r.Format(10)
	if !strings.Contains(out, "refused by the safety floor") {
		t.Errorf("the refusal must be visible in the rendered report; got:\n%s", out)
	}
}
