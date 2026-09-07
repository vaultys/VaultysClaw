package main

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/vaultys/vaultysclaw-sensor/internal/config"
)

// runCatalogDump writes the effective rule set as a catalog document. This is
// the honest starting point for editing one: it is generated from the binary's
// own defaults merged with whatever catalog is already in place, so it cannot
// drift from what the sensor actually uses the way a checked-in example would.
func runCatalogDump(configPath string) error {
	catalog, err := loadCatalog(configPath)
	if err != nil {
		return err
	}

	fmt.Print(dumpHeader)

	// With no override in play, emit the embedded catalog verbatim rather than
	// re-marshalling the parsed rules. It is the same rule set either way, but
	// the file carries comments explaining why several rules are shaped as they
	// are — which entries must precede which, and which tempting broad matcher
	// was left out on purpose. An operator starting from a dump should inherit
	// that reasoning, not a stripped round-trip of it.
	if _, statErr := os.Stat(catalog.Path()); statErr != nil {
		_, err = os.Stdout.Write(config.DefaultCatalogYAML())
		return err
	}

	out, err := config.MarshalCatalog(catalog.Current())
	if err != nil {
		return fmt.Errorf("rendering catalog: %w", err)
	}
	_, err = os.Stdout.Write(out)
	return err
}

const dumpHeader = `# The EFFECTIVE detection rule set, as this binary would use it right now.
#
# Save an edited copy to the catalogPath in your config (default
# ~/.vaultysclaw-sensor/catalog.yaml) and the running sensor picks it up on its
# next poll cycle — no restart.
#
# You rarely need this whole document: a catalog file is merged ADDITIVELY over
# the built-ins, so a file containing only your additions is the normal way to
# use it. Reusing a built-in rule's name extends that rule rather than replacing
# it; to drop a built-in, name it under 'disable:'. Run
# 'vaultysclaw-sensor catalog check' to verify a file before deploying it.

`

// runCatalogCheck validates a catalog and reports what it actually changes.
// "It parsed" is not the useful answer — an operator needs to see that their
// new rule arrived, and that nothing they did not intend went missing.
func runCatalogCheck(configPath string) error {
	catalog, err := loadCatalog(configPath)
	if err != nil {
		return err
	}

	path := catalog.Path()
	if _, statErr := os.Stat(path); statErr != nil {
		fmt.Printf("no catalog file at %s — using built-in rules only\n\n", path)
	} else {
		fmt.Printf("catalog: %s (valid)\n\n", path)
	}

	builtin := config.DefaultSensorConfig()
	effective := catalog.Current()

	fmt.Printf("%-18s %8s %8s\n", "", "built-in", "effective")
	report("providers", providerNames(builtin.Providers), providerNames(effective.Providers))
	report("aiApplications", appNames(builtin.AIApplications), appNames(effective.AIApplications))
	report("localRuntimes", runtimeNames(builtin.LocalRuntimes), runtimeNames(effective.LocalRuntimes))
	report("mcpServers", mcpNames(builtin.MCPServers), mcpNames(effective.MCPServers))
	report("agentFrameworks", frameworkNames(builtin.AgentFrameworks), frameworkNames(effective.AgentFrameworks))
	return nil
}

func loadCatalog(configPath string) (*config.CatalogWatcher, error) {
	cfg, err := config.LoadSensorRules(configPath)
	if err != nil {
		return nil, fmt.Errorf("loading config: %w", err)
	}
	return config.NewCatalogWatcher(cfg, nil)
}

// report prints one catalog's counts and names the rules a catalog file added
// or removed, so the effect of an edit is visible without diffing two dumps.
func report(label string, builtin, effective []string) {
	fmt.Printf("%-18s %8d %8d", label, len(builtin), len(effective))

	in := make(map[string]struct{}, len(builtin))
	for _, n := range builtin {
		in[n] = struct{}{}
	}
	have := make(map[string]struct{}, len(effective))
	for _, n := range effective {
		have[n] = struct{}{}
	}

	var added, removed []string
	for _, n := range effective {
		if _, ok := in[n]; !ok {
			added = append(added, n)
		}
	}
	for _, n := range builtin {
		if _, ok := have[n]; !ok {
			removed = append(removed, n)
		}
	}
	sort.Strings(added)
	sort.Strings(removed)

	var notes []string
	if len(added) > 0 {
		notes = append(notes, "added "+strings.Join(added, ", "))
	}
	if len(removed) > 0 {
		notes = append(notes, "disabled "+strings.Join(removed, ", "))
	}
	if len(notes) > 0 {
		fmt.Printf("   %s", strings.Join(notes, "; "))
	}
	fmt.Println()
}

func providerNames(rules []config.ProviderRule) []string {
	out := make([]string, 0, len(rules))
	for _, r := range rules {
		out = append(out, r.Name)
	}
	return out
}

func appNames(rules []config.AppRule) []string {
	out := make([]string, 0, len(rules))
	for _, r := range rules {
		out = append(out, r.Name)
	}
	return out
}

func runtimeNames(rules []config.RuntimeRule) []string {
	out := make([]string, 0, len(rules))
	for _, r := range rules {
		out = append(out, r.Name)
	}
	return out
}

func mcpNames(rules []config.MCPRule) []string {
	out := make([]string, 0, len(rules))
	for _, r := range rules {
		out = append(out, r.Name)
	}
	return out
}

func frameworkNames(rules []config.AgentFrameworkRule) []string {
	out := make([]string, 0, len(rules))
	for _, r := range rules {
		out = append(out, r.Name)
	}
	return out
}
