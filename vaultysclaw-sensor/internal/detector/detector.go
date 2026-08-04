package detector

import (
	"sort"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/config"
	"github.com/vaultys/vaultysclaw-sensor/internal/correlation"
)

// Detection is a deterministic, explainable classification result — never
// a bare isAgent boolean, per the design spec.
type Detection struct {
	AIConfidence    float64
	AgentConfidence float64
	Provider        string
	Reasons         []string
	IsMCP           bool
	MCPServers      []string
	IsLocalRuntime  bool
	// AgentFramework is the matched rule's name (config.AgentFrameworkRule.Name,
	// e.g. "vaultysclaw_agent"), or "" if none matched. Lets a workload known to
	// be running an agent framework carry IdentityEvidence (see internal/state)
	// without re-deriving the match from Reasons' free-text strings.
	AgentFramework string
}

// Classify runs the weighted rule set over a single Observation. cfg
// supplies the provider/runtime/MCP/agent-framework catalogs (data, not
// code), so operators can extend detection without touching this logic.
// resolver is optional (nil disables reverse-DNS-assisted provider
// matching, still using host matching against whatever the OS reported).
func Classify(obs correlation.Observation, cfg *config.Sensor, resolver *collector.ResolverCache) Detection {
	rt := collector.DetectLocalRuntime(obs.Process, obs.ListeningPorts, cfg.LocalRuntimes)

	aiSignals, provider := evaluateAI(obs, cfg, resolver, rt)
	aiConf, aiReasons := Combine(aiSignals)

	agentSignals, mcp, frameworkName := evaluateAgent(obs, cfg, aiConf > 0)
	agentConf, agentReasons := Combine(agentSignals)

	d := Detection{
		AIConfidence:    aiConf,
		AgentConfidence: agentConf,
		Provider:        provider,
		Reasons:         dedupeSorted(append(append([]string{}, aiReasons...), agentReasons...)),
		IsLocalRuntime:  rt != nil,
		AgentFramework:  frameworkName,
	}
	if mcp != nil {
		d.IsMCP = true
		d.MCPServers = mcp.Servers
	}
	return d
}

func dedupeSorted(reasons []string) []string {
	seen := make(map[string]struct{}, len(reasons))
	out := make([]string, 0, len(reasons))
	for _, r := range reasons {
		if _, ok := seen[r]; ok {
			continue
		}
		seen[r] = struct{}{}
		out = append(out, r)
	}
	sort.Strings(out)
	return out
}
