package collector

import (
	"strings"

	"github.com/vaultys/vaultysclaw-sensor/internal/config"
)

// LocalRuntimeMatch is a positive match against a configured local AI
// runtime rule (Ollama, LM Studio, vLLM, llama.cpp, LocalAI, ...).
type LocalRuntimeMatch struct {
	Name                 string
	MatchedByProcessName bool
	MatchedByCmdline     bool
	MatchedByPortOnly    bool
	Port                 int
}

// DetectLocalRuntime checks a process (and the ports it's listening on)
// against configured local-runtime rules. A listening port alone is a weak
// signal (many things can bind a port); a process-name or command-line
// match is much stronger evidence — see internal/detector/ai.go for how
// these are weighted.
func DetectLocalRuntime(proc Process, listeningPorts []int, rules []config.RuntimeRule) *LocalRuntimeMatch {
	lowerName := strings.ToLower(proc.Name)
	lowerCmd := strings.ToLower(proc.Command)

	for _, rule := range rules {
		matchedName := false
		for _, pn := range rule.ProcessNames {
			if pn != "" && lowerName == strings.ToLower(pn) {
				matchedName = true
			}
		}
		matchedCmd := false
		for _, sub := range rule.CmdlineSubstrings {
			if sub != "" && lowerCmd != "" && strings.Contains(lowerCmd, strings.ToLower(sub)) {
				matchedCmd = true
			}
		}
		matchedPort := 0
		for _, port := range rule.Ports {
			for _, lp := range listeningPorts {
				if lp == port {
					matchedPort = port
				}
			}
		}

		if matchedName || matchedCmd || matchedPort != 0 {
			return &LocalRuntimeMatch{
				Name:                 rule.Name,
				MatchedByProcessName: matchedName,
				MatchedByCmdline:     matchedCmd,
				MatchedByPortOnly:    !matchedName && !matchedCmd && matchedPort != 0,
				Port:                 matchedPort,
			}
		}
	}
	return nil
}
