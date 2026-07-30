package collector

import (
	"strings"

	"github.com/vaultys/vaultysclaw-sensor/internal/config"
)

// IsBrowserProcess reports whether name matches a configured browser
// executable. Browser processes contribute to AI-usage confidence but
// never to agent confidence — see internal/detector/agent.go.
func IsBrowserProcess(name string, browserNames []string) bool {
	lower := strings.ToLower(name)
	for _, b := range browserNames {
		if lower == strings.ToLower(b) {
			return true
		}
	}
	return false
}

// AgentFrameworkMatch is a positive match of a process's command line
// against a known agent-framework naming pattern.
type AgentFrameworkMatch struct {
	Name string
}

// DetectAgentFramework matches a process's command line against configured
// agent-framework substrings (langchain, autogen, crewai, ...). This is a
// naming-convention signal, not proof of an actual agent — combined with
// other signals by the detector.
func DetectAgentFramework(proc Process, rules []config.AgentFrameworkRule) *AgentFrameworkMatch {
	lower := strings.ToLower(proc.Command)
	if lower == "" {
		lower = strings.ToLower(proc.Executable)
	}
	for _, rule := range rules {
		for _, sub := range rule.CmdlineSubstrings {
			if sub == "" {
				continue
			}
			if strings.Contains(lower, strings.ToLower(sub)) {
				return &AgentFrameworkMatch{Name: rule.Name}
			}
		}
	}
	return nil
}

// LooksLikeAgentNaming reports a weak heuristic: the process's command
// line or executable name contains "agent" as a naming convention (e.g.
// "invoice-agent.py", "sales-agent.js"), distinct from a matched
// AgentFrameworkMatch which is a stronger, catalog-based signal.
func LooksLikeAgentNaming(proc Process) bool {
	lower := strings.ToLower(proc.Command)
	if lower == "" {
		lower = strings.ToLower(proc.Executable)
	}
	return strings.Contains(lower, "agent")
}
