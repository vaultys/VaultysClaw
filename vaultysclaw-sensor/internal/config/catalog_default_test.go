package config

import (
	"strings"
	"testing"
)

// TestDefaultCatalogIsValid keeps the panic in catalog_default.go unreachable
// in a shipped binary: the embedded file is compiled in, so if it parses and
// validates here it cannot fail at runtime.
func TestDefaultCatalogIsValid(t *testing.T) {
	c, err := ParseCatalog(defaultCatalogYAML)
	if err != nil {
		t.Fatalf("the embedded default catalog is invalid: %v", err)
	}
	if c.Replace {
		t.Error("the default catalog must not set replace — it is the base everything merges onto")
	}
	if len(c.Disable.Providers)+len(c.Disable.AIApplications)+len(c.Disable.LocalRuntimes)+
		len(c.Disable.MCPServers)+len(c.Disable.AgentFrameworks) != 0 {
		t.Error("the default catalog has nothing to disable; a disable: block here is a mistake")
	}
}

// TestDefaultCatalogHoldsTheRuleSet guards against an edit that silently
// empties a catalog — a truncated file would still parse and still validate.
func TestDefaultCatalogHoldsTheRuleSet(t *testing.T) {
	c := DefaultCatalog()
	for _, tc := range []struct {
		name string
		got  int
		min  int
	}{
		{"providers", len(c.Providers), 30},
		{"aiApplications", len(c.AIApplications), 25},
		{"localRuntimes", len(c.LocalRuntimes), 10},
		{"mcpServers", len(c.MCPServers), 5},
		{"agentFrameworks", len(c.AgentFrameworks), 12},
		{"browserProcessNames", len(c.BrowserProcess), 8},
		{"supportProcessSubstrings", len(c.SupportProcess), 8},
	} {
		if tc.got < tc.min {
			t.Errorf("%s: got %d rules, expected at least %d — did the catalog get truncated?", tc.name, tc.got, tc.min)
		}
	}
}

// TestDefaultCatalogOrderingInvariant pins the property the file's own comment
// warns about: DetectAIApplication returns the first match, and several rules
// live inside one another's install trees. Reordering these silently reports a
// coding agent as a chat window.
func TestDefaultCatalogOrderingInvariant(t *testing.T) {
	index := map[string]int{}
	for i, a := range DefaultCatalog().AIApplications {
		index[a.Name] = i
	}
	for _, pair := range [][2]string{
		// Claude Code ships inside Claude.app's support directory.
		{"claude_code", "claude_desktop"},
		// Codex ships inside ChatGPT.app's bundle.
		{"openai_codex", "openai_chatgpt_desktop"},
	} {
		first, second := pair[0], pair[1]
		fi, ok := index[first]
		if !ok {
			t.Fatalf("%s is missing from the default catalog", first)
		}
		si, ok := index[second]
		if !ok {
			t.Fatalf("%s is missing from the default catalog", second)
		}
		if fi > si {
			t.Errorf("%s must be matched before %s — it lives inside the other's install tree", first, second)
		}
	}
}

// TestDefaultCatalogKinds keeps the AI-usage/AI-agent line the design turns on:
// an assistant or an IDE must never be classified as a harness by accident.
func TestDefaultCatalogKinds(t *testing.T) {
	want := map[string]AppKind{
		"claude_code":            AppKindHarness,
		"openai_codex":           AppKindHarness,
		"cursor":                 AppKindHarness,
		"claude_desktop":         AppKindAssistant,
		"openai_chatgpt_desktop": AppKindAssistant,
		"moonshot_kimi":          AppKindAssistant,
		"vscode":                 AppKindIDE,
	}
	got := map[string]AppKind{}
	for _, a := range DefaultCatalog().AIApplications {
		got[a.Name] = a.Kind
	}
	for name, kind := range want {
		if got[name] != kind {
			t.Errorf("%s: expected kind %q, got %q", name, kind, got[name])
		}
	}
}

// TestDefaultCatalogYAMLIsVerbatim: `catalog dump` emits this file directly
// when there is no override, so the comments explaining why rules are shaped
// the way they are have to survive into an operator's starting point.
func TestDefaultCatalogYAMLIsVerbatim(t *testing.T) {
	out := string(DefaultCatalogYAML())
	if !strings.Contains(out, "ORDER MATTERS") {
		t.Error("the annotated defaults lost their explanatory comments")
	}
	// The accessor must copy: a caller mutating the slice would corrupt the
	// embedded bytes for every later reader.
	first := DefaultCatalogYAML()
	if len(first) == 0 {
		t.Fatal("empty catalog")
	}
	first[0] = 'X'
	if DefaultCatalogYAML()[0] == 'X' {
		t.Error("DefaultCatalogYAML handed out the embedded backing array")
	}
}

// TestDefaultSensorConfigUsesTheCatalog is the point of the migration: the
// built-ins reach a Sensor through the same merge an operator's file goes
// through, not through a separate assignment path.
func TestDefaultSensorConfigUsesTheCatalog(t *testing.T) {
	s := DefaultSensorConfig()
	if len(s.Providers) != len(DefaultCatalog().Providers) {
		t.Errorf("expected %d providers from the catalog, got %d", len(DefaultCatalog().Providers), len(s.Providers))
	}
	if len(s.AIApplications) == 0 || len(s.BrowserProcess) == 0 || len(s.SupportProcess) == 0 {
		t.Fatal("the default config did not pick up the embedded catalog")
	}
	// Operational defaults are settings, not detection data, and must still
	// come from Go — they have no business being reloadable.
	if s.ScanIntervalSeconds != 30 || s.IdentityPath == "" || s.CatalogPath == "" {
		t.Errorf("operational defaults were lost: %+v", s)
	}
}
