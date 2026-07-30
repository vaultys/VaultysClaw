package detector

import (
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/config"
	"github.com/vaultys/vaultysclaw-sensor/internal/correlation"
)

// evaluateAgent returns agent-confidence signals plus the MCP match (nil if
// none). Browser processes never contribute agent signals: a browser tab
// open to chatgpt.com is AI usage, not agentic behavior, regardless of how
// long it's been open — this is the core "AI usage vs AI agent"
// distinction from the design spec.
func evaluateAgent(obs correlation.Observation, cfg *config.Sensor, hasAIActivity bool) ([]Signal, *collector.MCPMatch) {
	if collector.IsBrowserProcess(obs.Process.Name, cfg.BrowserProcess) {
		return nil, nil
	}

	var signals []Signal

	mcp := collector.DetectMCP(obs.Process, obs.Children, cfg.MCPServers)
	if mcp != nil {
		if mcp.MatchedChild {
			signals = append(signals, Signal{Weight: WeightStrong, Reason: "MCP child process detected"})
		} else if mcp.MatchedSelf {
			signals = append(signals, Signal{Weight: WeightMedium, Reason: "process matches a known MCP server pattern"})
		}
	}

	if fw := collector.DetectAgentFramework(obs.Process, cfg.AgentFrameworks); fw != nil {
		signals = append(signals, Signal{Weight: WeightStrong, Reason: "known agent framework detected (" + fw.Name + ")"})
	}

	if hasAIActivity && !obs.Process.StartTime.IsZero() {
		if age := time.Since(obs.Process.StartTime); age >= longRunningThreshold {
			signals = append(signals, Signal{Weight: WeightMedium, Reason: "long-running AI-connected process"})
		}
	}

	if hasAIActivity && collector.LooksLikeAgentNaming(obs.Process) {
		signals = append(signals, Signal{Weight: WeightMedium, Reason: "executable/command naming suggests an agent"})
	}

	return signals, mcp
}
