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
	// Application is the matched AI application's name (config.AppRule.Name,
	// e.g. "openai_codex"), or "" if none matched, with ApplicationKind saying
	// what class it is. Reported separately from Provider because "which app is
	// running" and "whose API is it talking to" are different questions — a
	// harness pointed at a local Ollama has an application but no provider.
	Application     string
	ApplicationKind config.AppKind
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
func Classify(obs correlation.Observation, cfg *config.Sensor, resolver *collector.ResolverCache, index *collector.ProviderIndex) Detection {
	rt := collector.DetectLocalRuntime(obs.Process, obs.ListeningPorts, cfg.LocalRuntimes)
	// Ancestors count only for a process that is itself doing network I/O.
	// That is the case ancestry is for — an interpreter or helper a harness
	// spawned to talk to a model, which looks anonymous on its own — whereas
	// every `ps` and `grep` a harness shells out to has no connection and must
	// not inherit its parent's classification.
	var ancestors []collector.Process
	if len(obs.Connections) > 0 || len(obs.ListeningPorts) > 0 {
		ancestors = obs.Ancestors
	}
	app := collector.DetectAIApplication(obs.Process, ancestors, cfg.AIApplications, cfg.SupportProcess)

	aiSignals, provider := evaluateAI(obs, cfg, resolver, index, rt, app)
	aiConf, aiReasons := Combine(aiSignals)

	agentSignals, mcp, frameworkName := evaluateAgent(obs, cfg, aiConf > 0, app)
	agentConf, agentReasons := Combine(agentSignals)

	d := Detection{
		AIConfidence:    aiConf,
		AgentConfidence: agentConf,
		Provider:        provider,
		Reasons:         dedupeSorted(append(append([]string{}, aiReasons...), agentReasons...)),
		IsLocalRuntime:  rt != nil,
		AgentFramework:  frameworkName,
	}
	if app != nil {
		d.Application = app.Name
		d.ApplicationKind = app.Kind
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
