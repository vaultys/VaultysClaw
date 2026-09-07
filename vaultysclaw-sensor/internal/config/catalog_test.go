package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeCatalog(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "catalog.yaml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func providerByName(s *Sensor, name string) *ProviderRule {
	for i := range s.Providers {
		if s.Providers[i].Name == name {
			return &s.Providers[i]
		}
	}
	return nil
}

func appByName(s *Sensor, name string) *AppRule {
	for i := range s.AIApplications {
		if s.AIApplications[i].Name == name {
			return &s.AIApplications[i]
		}
	}
	return nil
}

func TestCatalogMergeIsAdditive(t *testing.T) {
	// The behaviour the whole file exists for: adding one rule must not delete
	// the other forty, which is what plain YAML slice unmarshalling would do.
	base := DefaultSensorConfig()
	builtinProviders := len(base.Providers)

	cat, err := LoadCatalog(writeCatalog(t, `
providers:
  - name: acme_internal_llm
    hosts: ["llm.acme.internal"]
aiApplications:
  - name: acme_devbot
    kind: harness
    processNames: ["devbot"]
`))
	if err != nil {
		t.Fatal(err)
	}
	merged := base.Apply(cat)

	if got := len(merged.Providers); got != builtinProviders+1 {
		t.Fatalf("expected %d providers, got %d — the built-ins were not preserved", builtinProviders+1, got)
	}
	if providerByName(merged, "anthropic") == nil {
		t.Error("a built-in provider went missing after merging one new rule")
	}
	if providerByName(merged, "acme_internal_llm") == nil {
		t.Error("the new provider was not added")
	}
	if a := appByName(merged, "acme_devbot"); a == nil || a.Kind != AppKindHarness {
		t.Errorf("expected acme_devbot as a harness, got %+v", a)
	}
	// The receiver must be untouched, so a bad reload can never damage the
	// running rule set.
	if len(base.Providers) != builtinProviders {
		t.Error("Apply mutated the base config")
	}
}

func TestCatalogReusingABuiltinNameExtendsIt(t *testing.T) {
	base := DefaultSensorConfig()
	before := len(providerByName(base, "openai").Hosts)

	cat, err := LoadCatalog(writeCatalog(t, `
providers:
  - name: openai
    hosts: ["api.eu.openai.com", "api.openai.com"]
`))
	if err != nil {
		t.Fatal(err)
	}
	merged := base.Apply(cat)

	openai := providerByName(merged, "openai")
	// One added, one already present and deduped — you can restate a host
	// without doubling it.
	if len(openai.Hosts) != before+1 {
		t.Fatalf("expected %d hosts, got %d: %v", before+1, len(openai.Hosts), openai.Hosts)
	}
	var found bool
	for _, h := range openai.Hosts {
		if h == "api.eu.openai.com" {
			found = true
		}
	}
	if !found {
		t.Error("the added host is missing")
	}
}

func TestCatalogDisableRemovesABuiltin(t *testing.T) {
	base := DefaultSensorConfig()
	cat, err := LoadCatalog(writeCatalog(t, `
disable:
  aiApplications: ["xcode"]
  providers: ["huggingface"]
`))
	if err != nil {
		t.Fatal(err)
	}
	merged := base.Apply(cat)
	if appByName(merged, "xcode") != nil {
		t.Error("xcode should have been disabled")
	}
	if providerByName(merged, "huggingface") != nil {
		t.Error("huggingface should have been disabled")
	}
	if appByName(merged, "openai_codex") == nil {
		t.Error("disabling one rule must not affect the others")
	}
}

func TestCatalogPriorityWinsOverBuiltinOrder(t *testing.T) {
	// DetectAIApplication returns the first match, and the built-in list is
	// ordered most-specific-first. A catalog rule refining a vendor's bundle
	// has to be able to get in front of the built-in for that bundle.
	base := DefaultSensorConfig()
	cat, err := LoadCatalog(writeCatalog(t, `
aiApplications:
  - name: kimi_cli
    kind: harness
    priority: 10
    cmdlineSubstrings: ["kimi-cli"]
`))
	if err != nil {
		t.Fatal(err)
	}
	merged := base.Apply(cat)
	if merged.AIApplications[0].Name != "kimi_cli" {
		t.Fatalf("expected the prioritised rule first, got %s", merged.AIApplications[0].Name)
	}
	// Equal-priority built-ins keep their relative order, which the
	// most-specific-first invariant depends on.
	var codex, chatgpt int
	for i, a := range merged.AIApplications {
		switch a.Name {
		case "openai_codex":
			codex = i
		case "openai_chatgpt_desktop":
			chatgpt = i
		}
	}
	if codex > chatgpt {
		t.Error("built-in ordering was disturbed: codex must still be matched before the ChatGPT bundle")
	}
}

func TestCatalogReplaceIsTotal(t *testing.T) {
	base := DefaultSensorConfig()
	cat, err := LoadCatalog(writeCatalog(t, `
replace: true
providers:
  - name: only_this
    hosts: ["llm.acme.internal"]
`))
	if err != nil {
		t.Fatal(err)
	}
	merged := base.Apply(cat)
	if len(merged.Providers) != 1 || merged.Providers[0].Name != "only_this" {
		t.Fatalf("replace must give the file the whole rule set, got %v", providerNamesOf(merged))
	}
	if len(merged.AIApplications) != 0 {
		t.Error("under replace, an omitted catalog really is empty")
	}
}

func providerNamesOf(s *Sensor) []string {
	out := make([]string, 0, len(s.Providers))
	for _, p := range s.Providers {
		out = append(out, p.Name)
	}
	return out
}

func TestCatalogRejectsUnsafeRules(t *testing.T) {
	cases := []struct{ name, body, wantErr string }{
		{"short cmdline substring", "aiApplications:\n  - name: oops\n    kind: harness\n    cmdlineSubstrings: [\"ai\"]\n", "too short"},
		{"short provider host", "providers:\n  - name: oops\n    hosts: [\"a\"]\n", "too short"},
		{"unknown app kind", "aiApplications:\n  - name: oops\n    kind: chatbot\n    processNames: [\"xyz\"]\n", "kind must be"},
		{"unnamed rule", "providers:\n  - hosts: [\"llm.acme.internal\"]\n", "needs a name"},
		{"no matchers", "aiApplications:\n  - name: oops\n    kind: harness\n", "never fire"},
		{"framework with nothing to match", "agentFrameworks:\n  - name: oops\n", "never fire"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := LoadCatalog(writeCatalog(t, tc.body))
			if err == nil {
				t.Fatal("expected an error")
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected an error mentioning %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestMissingCatalogIsNotAnError(t *testing.T) {
	// The default deployment: no file, built-ins only.
	cat, err := LoadCatalog(filepath.Join(t.TempDir(), "absent.yaml"))
	if err != nil {
		t.Fatalf("a missing catalog must mean 'use the built-ins', got %v", err)
	}
	merged := DefaultSensorConfig().Apply(cat)
	if len(merged.Providers) != len(DefaultSensorConfig().Providers) {
		t.Error("built-ins should be intact")
	}
}

// ---- hot reload ------------------------------------------------------------

func TestCatalogWatcherReloadsAndRefusesBadEdits(t *testing.T) {
	path := writeCatalog(t, "providers:\n  - name: acme_one\n    hosts: [\"one.acme.internal\"]\n")
	base := DefaultSensorConfig()
	base.CatalogPath = path

	w, err := NewCatalogWatcher(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	if providerByName(w.Current(), "acme_one") == nil {
		t.Fatal("the initial catalog was not applied")
	}

	// An untouched file is not reloaded.
	if changed, err := w.Reload(); changed || err != nil {
		t.Fatalf("expected no reload for an untouched file, got changed=%v err=%v", changed, err)
	}

	rewrite := func(body string) {
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		// Defeat coarse mtime granularity; size differs anyway in these cases.
		_ = os.Chtimes(path, time.Now().Add(time.Second), time.Now().Add(time.Second))
	}

	// The point of the whole mechanism: a new harness, live.
	rewrite("providers:\n  - name: acme_one\n    hosts: [\"one.acme.internal\"]\naiApplications:\n  - name: acme_devbot\n    kind: harness\n    processNames: [\"devbot\"]\n")
	changed, err := w.Reload()
	if err != nil || !changed {
		t.Fatalf("expected a reload, got changed=%v err=%v", changed, err)
	}
	if appByName(w.Current(), "acme_devbot") == nil {
		t.Fatal("the newly-added rule did not take effect")
	}

	// A broken edit must be refused with the running rule set kept — the one
	// failure mode a detection sensor cannot have is silently detecting less.
	rewrite("aiApplications:\n  - name: broken\n    kind: harness\n    cmdlineSubstrings: [\"x\"]\n")
	changed, err = w.Reload()
	if err == nil {
		t.Fatal("expected the invalid catalog to be refused")
	}
	if changed {
		t.Fatal("a refused reload must not report a change")
	}
	if appByName(w.Current(), "acme_devbot") == nil {
		t.Fatal("a refused reload must leave the previous rule set in force")
	}

	// And it retries rather than latching, so saving a fix recovers with no
	// restart — a file caught mid-write costs one cycle, not an outage.
	rewrite("aiApplications:\n  - name: acme_devbot2\n    kind: harness\n    processNames: [\"devbot2\"]\n")
	if changed, err := w.Reload(); err != nil || !changed {
		t.Fatalf("expected recovery after the fix, got changed=%v err=%v", changed, err)
	}
	if appByName(w.Current(), "acme_devbot2") == nil {
		t.Fatal("the corrected catalog did not take effect")
	}
	// Removing a disable/rule really removes it, which only works because each
	// reload re-merges from the pristine base.
	if providerByName(w.Current(), "acme_one") != nil {
		t.Error("a rule dropped from the file should be gone, not remembered from the previous merge")
	}
}

func TestCatalogWatcherDeletionRevertsToBuiltins(t *testing.T) {
	path := writeCatalog(t, "providers:\n  - name: acme_one\n    hosts: [\"one.acme.internal\"]\n")
	base := DefaultSensorConfig()
	base.CatalogPath = path
	w, err := NewCatalogWatcher(base, nil)
	if err != nil {
		t.Fatal(err)
	}

	// Deleting the file is a legitimate way to back out a bad catalog.
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	changed, err := w.Reload()
	if err != nil || !changed {
		t.Fatalf("expected deletion to be picked up, got changed=%v err=%v", changed, err)
	}
	if providerByName(w.Current(), "acme_one") != nil {
		t.Error("the deleted catalog's rules should be gone")
	}
	if providerByName(w.Current(), "anthropic") == nil {
		t.Error("built-ins should be back in force")
	}
}

func TestMarshalCatalogRoundTrips(t *testing.T) {
	// `catalog dump` output must be a valid catalog — it is advertised as the
	// starting point for editing one.
	out, err := MarshalCatalog(DefaultSensorConfig())
	if err != nil {
		t.Fatal(err)
	}
	cat, err := LoadCatalog(writeCatalog(t, string(out)))
	if err != nil {
		t.Fatalf("dumped catalog did not validate: %v", err)
	}
	merged := DefaultSensorConfig().Apply(cat)
	if len(merged.Providers) != len(DefaultSensorConfig().Providers) {
		t.Errorf("round-tripping the defaults should be a no-op, got %d providers", len(merged.Providers))
	}
	if len(merged.AIApplications) != len(DefaultSensorConfig().AIApplications) {
		t.Errorf("round-tripping the defaults should be a no-op, got %d applications", len(merged.AIApplications))
	}
}

func TestRuleKeysInConfigNamesTheTrap(t *testing.T) {
	// Detection rules in config.yaml still work but REPLACE the built-ins,
	// which is almost never intended. The sensor names them at startup rather
	// than leaving a quiet loss of coverage to be discovered later.
	path := writeCatalog(t, "telemetryEnabled: false\nproviders:\n  - name: only_mine\n    hosts: [\"llm.acme.internal\"]\nmcpServers: []\n")
	got := RuleKeysInConfig(path)
	if len(got) != 2 || got[0] != "providers" || got[1] != "mcpServers" {
		t.Fatalf("expected [providers mcpServers], got %v", got)
	}

	clean := writeCatalog(t, "telemetryEnabled: false\nscanIntervalSeconds: 10\n")
	if got := RuleKeysInConfig(clean); got != nil {
		t.Errorf("a config with no detection rules should report none, got %v", got)
	}
	if got := RuleKeysInConfig(filepath.Join(t.TempDir(), "absent.yaml")); got != nil {
		t.Errorf("a missing config should report none, got %v", got)
	}
}
