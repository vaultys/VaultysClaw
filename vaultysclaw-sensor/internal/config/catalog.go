package config

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Catalog is the detection rule set as an operator maintains it: a YAML file,
// separate from the daemon's own settings, merged over the built-in defaults.
//
// It is a distinct file from config.yaml on purpose. Detection rules change on
// a completely different cadence from a sensor's identity, ports and roles —
// a new coding harness ships every few weeks, while a deployment's collector
// URL is set once. Keeping them apart means the catalog can be re-distributed
// by configuration management, reviewed on its own, and reloaded while the
// sensor is running, without anyone touching operational settings to do it.
//
// The merge is ADDITIVE by default. A file listing one new provider adds one
// provider; it does not silently discard the other forty. This is the whole
// point: plain YAML unmarshalling replaces slices wholesale, so a naive
// `providers:` key in config.yaml would delete the built-in catalog and leave
// an operator wondering why detection got worse after they added a rule.
type Catalog struct {
	Providers       []ProviderRule       `yaml:"providers,omitempty"`
	AIApplications  []AppRule            `yaml:"aiApplications,omitempty"`
	LocalRuntimes   []RuntimeRule        `yaml:"localRuntimes,omitempty"`
	MCPServers      []MCPRule            `yaml:"mcpServers,omitempty"`
	AgentFrameworks []AgentFrameworkRule `yaml:"agentFrameworks,omitempty"`
	BrowserProcess  []string             `yaml:"browserProcessNames,omitempty"`
	SupportProcess  []string             `yaml:"supportProcessSubstrings,omitempty"`

	// Disable removes built-in rules by name. The way to correct a built-in
	// that false-positives in your environment without forking the catalog.
	Disable CatalogDisable `yaml:"disable,omitempty"`

	// Replace opts out of merging entirely: the file's catalogs become the
	// whole rule set. For a locked-down deployment that ships its own vetted
	// list and does not want an upgrade to widen what the sensor looks at.
	// Every catalog left empty under Replace really is empty — this is a
	// deliberate, auditable choice, not a convenience.
	Replace bool `yaml:"replace,omitempty"`
}

// CatalogDisable names built-in rules to drop, per catalog.
type CatalogDisable struct {
	Providers       []string `yaml:"providers,omitempty"`
	AIApplications  []string `yaml:"aiApplications,omitempty"`
	LocalRuntimes   []string `yaml:"localRuntimes,omitempty"`
	MCPServers      []string `yaml:"mcpServers,omitempty"`
	AgentFrameworks []string `yaml:"agentFrameworks,omitempty"`
}

// minPatternLength rejects matcher fragments too short to mean anything. A
// two-character host fragment or executable substring matches most of the
// process table, and the resulting flood of false positives is far harder to
// diagnose than a startup error naming the rule that caused it.
const minPatternLength = 3

// LoadCatalog reads a catalog file. A missing file is not an error — it means
// "use the built-ins", which is the default deployment.
func LoadCatalog(path string) (*Catalog, error) {
	if strings.TrimSpace(path) == "" {
		return &Catalog{}, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &Catalog{}, nil
		}
		return nil, fmt.Errorf("catalog: reading %s: %w", path, err)
	}
	c, err := ParseCatalog(data)
	if err != nil {
		return nil, fmt.Errorf("catalog: %s: %w", path, err)
	}
	return c, nil
}

// ParseCatalog parses and validates a catalog document. Shared by the
// operator-supplied file and the embedded defaults so both are held to exactly
// the same rules — a built-in that would be rejected in a deployment's own
// catalog has no business shipping either.
func ParseCatalog(data []byte) (*Catalog, error) {
	var c Catalog
	if err := yaml.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("parsing: %w", err)
	}
	if err := c.Validate(); err != nil {
		return nil, err
	}
	return &c, nil
}

// Validate rejects rules that cannot work: an unnamed rule (nothing to report,
// nothing to disable it by), a rule with no matchers (it would never fire), and
// a matcher fragment short enough to match everything.
func (c *Catalog) Validate() error {
	for _, p := range c.Providers {
		if strings.TrimSpace(p.Name) == "" {
			return fmt.Errorf("every provider needs a name")
		}
		if len(p.Hosts) == 0 {
			return fmt.Errorf("provider %q has no hosts", p.Name)
		}
		for _, h := range p.Hosts {
			if err := checkPattern("provider "+p.Name, "host", h); err != nil {
				return err
			}
		}
	}
	for _, a := range c.AIApplications {
		if strings.TrimSpace(a.Name) == "" {
			return fmt.Errorf("every aiApplication needs a name")
		}
		switch a.Kind {
		case AppKindAssistant, AppKindHarness, AppKindIDE:
		default:
			return fmt.Errorf("aiApplication %q: kind must be %q, %q or %q (got %q)",
				a.Name, AppKindHarness, AppKindAssistant, AppKindIDE, a.Kind)
		}
		if len(a.ProcessNames)+len(a.ExecutableSubstrings)+len(a.CmdlineSubstrings) == 0 {
			return fmt.Errorf("aiApplication %q has no matchers and would never fire", a.Name)
		}
		for _, s := range a.ExecutableSubstrings {
			if err := checkPattern("aiApplication "+a.Name, "executableSubstring", s); err != nil {
				return err
			}
		}
		for _, s := range a.CmdlineSubstrings {
			if err := checkPattern("aiApplication "+a.Name, "cmdlineSubstring", s); err != nil {
				return err
			}
		}
	}
	for _, r := range c.LocalRuntimes {
		if strings.TrimSpace(r.Name) == "" {
			return fmt.Errorf("every localRuntime needs a name")
		}
		if len(r.ProcessNames)+len(r.CmdlineSubstrings)+len(r.Ports) == 0 {
			return fmt.Errorf("localRuntime %q has no matchers and would never fire", r.Name)
		}
		for _, s := range r.CmdlineSubstrings {
			if err := checkPattern("localRuntime "+r.Name, "cmdlineSubstring", s); err != nil {
				return err
			}
		}
	}
	for _, m := range c.MCPServers {
		if strings.TrimSpace(m.Name) == "" {
			return fmt.Errorf("every mcpServer needs a name")
		}
		if len(m.CmdlineSubstrings) == 0 {
			return fmt.Errorf("mcpServer %q has no cmdlineSubstrings and would never fire", m.Name)
		}
		for _, s := range m.CmdlineSubstrings {
			if err := checkPattern("mcpServer "+m.Name, "cmdlineSubstring", s); err != nil {
				return err
			}
		}
	}
	for _, f := range c.AgentFrameworks {
		if strings.TrimSpace(f.Name) == "" {
			return fmt.Errorf("every agentFramework needs a name")
		}
		if len(f.CmdlineSubstrings) == 0 {
			return fmt.Errorf("agentFramework %q has no cmdlineSubstrings and would never fire", f.Name)
		}
		for _, s := range f.CmdlineSubstrings {
			if err := checkPattern("agentFramework "+f.Name, "cmdlineSubstring", s); err != nil {
				return err
			}
		}
	}
	return nil
}

func checkPattern(owner, field, pattern string) error {
	trimmed := strings.TrimSpace(pattern)
	if trimmed == "" {
		return fmt.Errorf("%s: empty %s", owner, field)
	}
	// A leading dot is the provider suffix form (".openai.azure.com"); the dot
	// itself is syntax, not something that narrows the match.
	if len(strings.TrimPrefix(trimmed, ".")) < minPatternLength {
		return fmt.Errorf("%s: %s %q is too short to be safe — it would match almost every process on the machine; use at least %d characters",
			owner, field, pattern, minPatternLength)
	}
	return nil
}

// Apply merges the catalog into a Sensor's rule sets and returns a copy: the
// receiver config is never mutated, so a reload that turns out to be invalid
// leaves the running rule set exactly as it was.
func (s *Sensor) Apply(c *Catalog) *Sensor {
	merged := *s
	if c == nil {
		return &merged
	}

	if c.Replace {
		merged.Providers = c.Providers
		merged.AIApplications = sortAppRules(c.AIApplications)
		merged.LocalRuntimes = c.LocalRuntimes
		merged.MCPServers = c.MCPServers
		merged.AgentFrameworks = c.AgentFrameworks
		if len(c.BrowserProcess) > 0 {
			merged.BrowserProcess = c.BrowserProcess
		}
		if len(c.SupportProcess) > 0 {
			merged.SupportProcess = c.SupportProcess
		}
		return &merged
	}

	merged.Providers = mergeProviders(merged.Providers, c.Providers, c.Disable.Providers)
	merged.AIApplications = sortAppRules(mergeApps(merged.AIApplications, c.AIApplications, c.Disable.AIApplications))
	merged.LocalRuntimes = mergeRuntimes(merged.LocalRuntimes, c.LocalRuntimes, c.Disable.LocalRuntimes)
	merged.MCPServers = mergeMCP(merged.MCPServers, c.MCPServers, c.Disable.MCPServers)
	merged.AgentFrameworks = mergeFrameworks(merged.AgentFrameworks, c.AgentFrameworks, c.Disable.AgentFrameworks)
	merged.BrowserProcess = unionStrings(merged.BrowserProcess, c.BrowserProcess)
	merged.SupportProcess = unionStrings(merged.SupportProcess, c.SupportProcess)
	return &merged
}

// sortAppRules puts higher-priority rules first while keeping equal-priority
// rules in their original order. DetectAIApplication returns the first match,
// and the built-in list is ordered most-specific-first (Claude Code lives
// inside Claude.app's tree; Codex inside ChatGPT.app's). An operator adding a
// harness that ships inside some vendor's bundle would otherwise always lose
// to the built-in rule for that bundle; a positive `priority` is how they win
// without having to disable the rule they are refining.
func sortAppRules(rules []AppRule) []AppRule {
	out := append([]AppRule(nil), rules...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Priority > out[j].Priority })
	return out
}

func disabled(names []string) map[string]struct{} {
	if len(names) == 0 {
		return nil
	}
	m := make(map[string]struct{}, len(names))
	for _, n := range names {
		m[strings.ToLower(strings.TrimSpace(n))] = struct{}{}
	}
	return m
}

func isDisabled(m map[string]struct{}, name string) bool {
	if m == nil {
		return false
	}
	_, ok := m[strings.ToLower(strings.TrimSpace(name))]
	return ok
}

// unionStrings appends the entries of extra that base does not already have,
// compared case-insensitively. Order is preserved so a catalog's additions are
// always evaluated after the built-ins they extend.
func unionStrings(base, extra []string) []string {
	seen := make(map[string]struct{}, len(base))
	for _, b := range base {
		seen[strings.ToLower(b)] = struct{}{}
	}
	out := append([]string(nil), base...)
	for _, e := range extra {
		if strings.TrimSpace(e) == "" {
			continue
		}
		if _, ok := seen[strings.ToLower(e)]; ok {
			continue
		}
		seen[strings.ToLower(e)] = struct{}{}
		out = append(out, e)
	}
	return out
}

func mergeProviders(base, extra []ProviderRule, drop []string) []ProviderRule {
	off := disabled(drop)
	byName := make(map[string]int, len(base))
	out := make([]ProviderRule, 0, len(base)+len(extra))
	for _, b := range base {
		if isDisabled(off, b.Name) {
			continue
		}
		byName[strings.ToLower(b.Name)] = len(out)
		out = append(out, b)
	}
	for _, e := range extra {
		if isDisabled(off, e.Name) {
			continue
		}
		// A rule reusing a built-in's name extends it — that is how you add one
		// regional endpoint to "openai" without restating the other four.
		if i, ok := byName[strings.ToLower(e.Name)]; ok {
			out[i].Hosts = unionStrings(out[i].Hosts, e.Hosts)
			continue
		}
		byName[strings.ToLower(e.Name)] = len(out)
		out = append(out, e)
	}
	return out
}

func mergeApps(base, extra []AppRule, drop []string) []AppRule {
	off := disabled(drop)
	byName := make(map[string]int, len(base))
	out := make([]AppRule, 0, len(base)+len(extra))
	for _, b := range base {
		if isDisabled(off, b.Name) {
			continue
		}
		byName[strings.ToLower(b.Name)] = len(out)
		out = append(out, b)
	}
	for _, e := range extra {
		if isDisabled(off, e.Name) {
			continue
		}
		if i, ok := byName[strings.ToLower(e.Name)]; ok {
			out[i].ProcessNames = unionStrings(out[i].ProcessNames, e.ProcessNames)
			out[i].ExecutableSubstrings = unionStrings(out[i].ExecutableSubstrings, e.ExecutableSubstrings)
			out[i].CmdlineSubstrings = unionStrings(out[i].CmdlineSubstrings, e.CmdlineSubstrings)
			// Kind and Priority are single-valued, so an override wins outright
			// — that is the only way to reclassify a built-in (say, to treat an
			// assistant as a harness because your deployment runs it that way).
			if e.Kind != "" {
				out[i].Kind = e.Kind
			}
			if e.Priority != 0 {
				out[i].Priority = e.Priority
			}
			continue
		}
		byName[strings.ToLower(e.Name)] = len(out)
		out = append(out, e)
	}
	return out
}

func mergeRuntimes(base, extra []RuntimeRule, drop []string) []RuntimeRule {
	off := disabled(drop)
	byName := make(map[string]int, len(base))
	out := make([]RuntimeRule, 0, len(base)+len(extra))
	for _, b := range base {
		if isDisabled(off, b.Name) {
			continue
		}
		byName[strings.ToLower(b.Name)] = len(out)
		out = append(out, b)
	}
	for _, e := range extra {
		if isDisabled(off, e.Name) {
			continue
		}
		if i, ok := byName[strings.ToLower(e.Name)]; ok {
			out[i].ProcessNames = unionStrings(out[i].ProcessNames, e.ProcessNames)
			out[i].CmdlineSubstrings = unionStrings(out[i].CmdlineSubstrings, e.CmdlineSubstrings)
			out[i].Ports = unionInts(out[i].Ports, e.Ports)
			continue
		}
		byName[strings.ToLower(e.Name)] = len(out)
		out = append(out, e)
	}
	return out
}

func mergeMCP(base, extra []MCPRule, drop []string) []MCPRule {
	off := disabled(drop)
	byName := make(map[string]int, len(base))
	out := make([]MCPRule, 0, len(base)+len(extra))
	for _, b := range base {
		if isDisabled(off, b.Name) {
			continue
		}
		byName[strings.ToLower(b.Name)] = len(out)
		out = append(out, b)
	}
	for _, e := range extra {
		if isDisabled(off, e.Name) {
			continue
		}
		if i, ok := byName[strings.ToLower(e.Name)]; ok {
			out[i].CmdlineSubstrings = unionStrings(out[i].CmdlineSubstrings, e.CmdlineSubstrings)
			continue
		}
		byName[strings.ToLower(e.Name)] = len(out)
		out = append(out, e)
	}
	return out
}

func mergeFrameworks(base, extra []AgentFrameworkRule, drop []string) []AgentFrameworkRule {
	off := disabled(drop)
	byName := make(map[string]int, len(base))
	out := make([]AgentFrameworkRule, 0, len(base)+len(extra))
	for _, b := range base {
		if isDisabled(off, b.Name) {
			continue
		}
		byName[strings.ToLower(b.Name)] = len(out)
		out = append(out, b)
	}
	for _, e := range extra {
		if isDisabled(off, e.Name) {
			continue
		}
		if i, ok := byName[strings.ToLower(e.Name)]; ok {
			out[i].CmdlineSubstrings = unionStrings(out[i].CmdlineSubstrings, e.CmdlineSubstrings)
			continue
		}
		byName[strings.ToLower(e.Name)] = len(out)
		out = append(out, e)
	}
	return out
}

func unionInts(base, extra []int) []int {
	seen := make(map[int]struct{}, len(base))
	for _, b := range base {
		seen[b] = struct{}{}
	}
	out := append([]int(nil), base...)
	for _, e := range extra {
		if _, ok := seen[e]; ok {
			continue
		}
		seen[e] = struct{}{}
		out = append(out, e)
	}
	return out
}

// MarshalCatalog renders a sensor's effective rule set as a catalog document.
// This is what `vaultysclaw-sensor catalog dump` writes: the honest starting
// point for editing, rather than a hand-maintained example that drifts from
// what the binary actually ships.
func MarshalCatalog(s *Sensor) ([]byte, error) {
	return yaml.Marshal(Catalog{
		Providers:       s.Providers,
		AIApplications:  s.AIApplications,
		LocalRuntimes:   s.LocalRuntimes,
		MCPServers:      s.MCPServers,
		AgentFrameworks: s.AgentFrameworks,
		BrowserProcess:  s.BrowserProcess,
		SupportProcess:  s.SupportProcess,
	})
}

// ruleKeys are the detection catalogs that also exist as Sensor fields, and so
// can still be set in config.yaml.
var ruleKeys = []string{
	"providers", "aiApplications", "localRuntimes", "mcpServers",
	"agentFrameworks", "browserProcessNames", "supportProcessSubstrings",
}

// RuleKeysInConfig reports detection catalogs set in config.yaml itself.
//
// They still work, and are still honoured, but they REPLACE the built-in
// catalog rather than merging with it — plain YAML unmarshalling has no other
// behaviour available. That is almost never what someone adding a rule wants,
// and the symptom is detection quietly getting worse, so the sensor names the
// keys at startup and points at the catalog rather than leaving it to be
// discovered. Nothing is refused: a deployment that meant it keeps working.
func RuleKeysInConfig(path string) []string {
	if strings.TrimSpace(path) == "" {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var raw map[string]yaml.Node
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil
	}
	var found []string
	for _, k := range ruleKeys {
		if _, ok := raw[k]; ok {
			found = append(found, k)
		}
	}
	return found
}
