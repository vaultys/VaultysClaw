package detector

import (
	"testing"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/config"
	"github.com/vaultys/vaultysclaw-sensor/internal/correlation"
)

func testConfig() *config.Sensor {
	return config.DefaultSensorConfig()
}

func obs(proc collector.Process, children []collector.Process, conns []collector.Connection, listening []int) correlation.Observation {
	return correlation.Observation{
		Process:        proc,
		Children:       children,
		Connections:    conns,
		ListeningPorts: listening,
		Device:         correlation.DeviceInfo{ID: "device-1", Hostname: "test-host", OS: "darwin"},
	}
}

func conn(host string, port int) collector.Connection {
	return collector.Connection{RemoteHost: host, RemotePort: port, State: collector.ConnEstablished}
}

const (
	aiHigh     = 0.85
	aiVeryHigh = 0.95
	agentLow   = 0.05
	agentMed   = 0.4
	agentHigh  = 0.8
)

func TestClassify_ChromeToChatGPT_AIUsageNotAgent(t *testing.T) {
	o := obs(collector.Process{PID: 100, Name: "Google Chrome", Command: "/Applications/Google Chrome.app/.../Google Chrome --type=renderer"},
		nil, []collector.Connection{conn("chatgpt.com", 443)}, nil)

	d := Classify(o, testConfig(), nil, nil)

	if d.AIConfidence < aiHigh {
		t.Errorf("expected high AI confidence for browser->ChatGPT, got %v", d.AIConfidence)
	}
	if d.AgentConfidence > agentLow {
		t.Errorf("expected ~zero agent confidence for a browser tab, got %v", d.AgentConfidence)
	}
	if d.Provider != "openai" {
		t.Errorf("expected provider openai, got %q", d.Provider)
	}
}

func TestClassify_SafariToClaude_AIUsageNotAgent(t *testing.T) {
	o := obs(collector.Process{PID: 101, Name: "Safari", Command: "/Applications/Safari.app/Contents/MacOS/Safari"},
		nil, []collector.Connection{conn("claude.ai", 443)}, nil)

	d := Classify(o, testConfig(), nil, nil)

	if d.AIConfidence < aiHigh {
		t.Errorf("expected high AI confidence for Safari->Claude, got %v", d.AIConfidence)
	}
	if d.AgentConfidence > agentLow {
		t.Errorf("expected ~zero agent confidence for a browser tab, got %v", d.AgentConfidence)
	}
	if d.Provider != "anthropic" {
		t.Errorf("expected provider anthropic, got %q", d.Provider)
	}
}

func TestClassify_PythonInvoiceAgent_ProbableAIWorkload(t *testing.T) {
	o := obs(collector.Process{PID: 102, Name: "python3", Command: "python3 invoice-agent.py", StartTime: time.Now().Add(-time.Minute)},
		nil, []collector.Connection{conn("api.openai.com", 443)}, nil)

	d := Classify(o, testConfig(), nil, nil)

	if d.AIConfidence < aiHigh {
		t.Errorf("expected high AI confidence for python->OpenAI, got %v", d.AIConfidence)
	}
	if d.AgentConfidence < agentMed {
		t.Errorf("expected at least medium agent confidence from 'agent' naming, got %v", d.AgentConfidence)
	}
	if len(d.Reasons) == 0 {
		t.Error("expected explainable reasons")
	}
}

func TestClassify_NodeSalesAgentWithMCPSalesforce_HighConfidenceAgent(t *testing.T) {
	child := collector.Process{PID: 201, PPID: 200, Name: "node", Command: "npx @modelcontextprotocol/server-salesforce"}
	o := obs(collector.Process{PID: 200, Name: "node", Command: "node sales-agent.js", StartTime: time.Now().Add(-45 * time.Minute)},
		[]collector.Process{child}, []collector.Connection{conn("api.anthropic.com", 443)}, nil)

	d := Classify(o, testConfig(), nil, nil)

	if d.AIConfidence < aiVeryHigh {
		t.Errorf("expected very high AI confidence, got %v", d.AIConfidence)
	}
	if d.AgentConfidence < agentHigh {
		t.Errorf("expected high agent confidence (MCP child + long-running + naming), got %v", d.AgentConfidence)
	}
	if !d.IsMCP {
		t.Error("expected IsMCP to be true")
	}
	if d.Provider != "anthropic" {
		t.Errorf("expected provider anthropic, got %q", d.Provider)
	}
}

func TestClassify_OllamaServe_LocalRuntimeDetected(t *testing.T) {
	o := obs(collector.Process{PID: 300, Name: "ollama", Command: "ollama serve"}, nil, nil, []int{11434})

	d := Classify(o, testConfig(), nil, nil)

	if !d.IsLocalRuntime {
		t.Error("expected IsLocalRuntime to be true for ollama serve")
	}
	if d.AIConfidence < aiHigh {
		t.Errorf("expected high AI confidence for a known local runtime, got %v", d.AIConfidence)
	}
	if d.AgentConfidence > agentLow {
		t.Errorf("expected ~zero agent confidence for a bare runtime with no agent signals, got %v", d.AgentConfidence)
	}
	if d.Provider != "ollama" {
		t.Errorf("expected provider ollama, got %q", d.Provider)
	}
}

func TestClassify_ClaudeDesktopWithMCPFilesystem(t *testing.T) {
	child := collector.Process{PID: 401, PPID: 400, Name: "node", Command: "npx @modelcontextprotocol/server-filesystem /Users/fx/Documents"}
	o := obs(collector.Process{PID: 400, Name: "Claude", Command: "/Applications/Claude.app/Contents/MacOS/Claude"},
		[]collector.Process{child}, []collector.Connection{conn("claude.ai", 443)}, nil)

	d := Classify(o, testConfig(), nil, nil)

	if !d.IsMCP {
		t.Error("expected IsMCP to be true for Claude Desktop spawning an MCP filesystem server")
	}
	if d.AgentConfidence < agentHigh {
		t.Errorf("expected high agent confidence from MCP child process, got %v", d.AgentConfidence)
	}
	if d.AIConfidence < aiHigh {
		t.Errorf("expected high AI confidence, got %v", d.AIConfidence)
	}
}

func TestClassify_NodeAppWithMCPPostgres(t *testing.T) {
	child := collector.Process{PID: 501, PPID: 500, Name: "node", Command: "npx @modelcontextprotocol/server-postgres"}
	o := obs(collector.Process{PID: 500, Name: "node", Command: "node crm-agent.js"},
		[]collector.Process{child}, []collector.Connection{conn("api.openai.com", 443)}, nil)

	d := Classify(o, testConfig(), nil, nil)

	if !d.IsMCP {
		t.Error("expected IsMCP to be true")
	}
	if d.AgentConfidence < agentHigh {
		t.Errorf("expected high agent confidence, got %v", d.AgentConfidence)
	}
}

func TestClassify_UnknownProcessToAzureOpenAI(t *testing.T) {
	o := obs(collector.Process{PID: 600, Name: "unknownbinary", Command: "unknownbinary --do-something"},
		nil, []collector.Connection{conn("mycompany.openai.azure.com", 443)}, nil)

	d := Classify(o, testConfig(), nil, nil)

	if d.Provider != "azure_openai" {
		t.Errorf("expected provider azure_openai, got %q", d.Provider)
	}
	if d.AIConfidence < aiHigh {
		t.Errorf("expected high AI confidence, got %v", d.AIConfidence)
	}
	if d.AgentConfidence > agentLow {
		t.Errorf("expected ~zero agent confidence for an unremarkable process, got %v", d.AgentConfidence)
	}
}

func TestClassify_VaultysclawAgent_SetsAgentFramework(t *testing.T) {
	o := obs(collector.Process{PID: 800, Name: "node", Command: "node dist/agent-controller/cli.js run"},
		nil, []collector.Connection{conn("api.anthropic.com", 443)}, nil)

	d := Classify(o, testConfig(), nil, nil)

	if d.AgentFramework != "vaultysclaw_agent" {
		t.Errorf("expected AgentFramework %q, got %q", "vaultysclaw_agent", d.AgentFramework)
	}
	if d.AgentConfidence <= agentLow {
		t.Errorf("expected non-trivial agent confidence for a known framework match, got %v", d.AgentConfidence)
	}
}

func TestClassify_NoAgentFrameworkMatch_LeavesAgentFrameworkEmpty(t *testing.T) {
	o := obs(collector.Process{PID: 801, Name: "unknownbinary", Command: "unknownbinary --do-something"},
		nil, []collector.Connection{conn("api.anthropic.com", 443)}, nil)

	d := Classify(o, testConfig(), nil, nil)

	if d.AgentFramework != "" {
		t.Errorf("expected no AgentFramework match, got %q", d.AgentFramework)
	}
}

func TestClassify_NoSignals_ZeroConfidence(t *testing.T) {
	o := obs(collector.Process{PID: 700, Name: "bash", Command: "bash -c ls"}, nil, nil, nil)

	d := Classify(o, testConfig(), nil, nil)

	if d.AIConfidence != 0 || d.AgentConfidence != 0 {
		t.Errorf("expected zero confidence for an unrelated process, got AI=%v Agent=%v", d.AIConfidence, d.AgentConfidence)
	}
	if len(d.Reasons) != 0 {
		t.Errorf("expected no reasons, got %v", d.Reasons)
	}
}

// ---- application-catalog detection ----------------------------------------

func appObs(proc collector.Process, ancestors []collector.Process, conns []collector.Connection) correlation.Observation {
	o := obs(proc, nil, conns, nil)
	o.Ancestors = ancestors
	return o
}

func TestClassify_CodexHelper_DetectedWithNoNetworkVisibility(t *testing.T) {
	// The case that motivated the application catalog: on macOS the sensor
	// often sees a Codex helper with no resolvable peer at all. Before, that
	// scored zero and the workload was invisible.
	o := appObs(collector.Process{
		PID:        200,
		Name:       "Codex (Service)",
		Executable: "/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/Codex (Service).app/Contents/MacOS/Codex (Service)",
		StartTime:  time.Now().Add(-time.Minute),
	}, nil, nil)

	d := Classify(o, testConfig(), nil, nil)

	if d.Application != "openai_codex" {
		t.Fatalf("expected openai_codex, got %q", d.Application)
	}
	if d.AIConfidence < aiHigh {
		t.Errorf("expected high AI confidence, got %v", d.AIConfidence)
	}
	if d.AgentConfidence < agentHigh {
		t.Errorf("a coding harness is agentic by definition; got agent confidence %v", d.AgentConfidence)
	}
	if d.Provider != "openai_codex" {
		t.Errorf("with no provider connection the app name should stand in, got %q", d.Provider)
	}
}

func TestClassify_KimiDesktop_AIUsageNotAgent(t *testing.T) {
	o := appObs(collector.Process{
		PID:        201,
		Name:       "Kimi",
		Executable: "/Applications/Kimi.app/Contents/MacOS/Kimi",
		StartTime:  time.Now().Add(-time.Minute),
	}, nil, nil)

	d := Classify(o, testConfig(), nil, nil)

	if d.Application != "moonshot_kimi" {
		t.Fatalf("expected moonshot_kimi, got %q", d.Application)
	}
	if d.AIConfidence < aiHigh {
		t.Errorf("expected high AI confidence, got %v", d.AIConfidence)
	}
	// Same line browsers sit on: a chat window is AI usage, not an agent.
	if d.AgentConfidence > agentLow {
		t.Errorf("an assistant app must not score as an agent, got %v", d.AgentConfidence)
	}
}

func TestClassify_IDEAloneIsNotAIUsage(t *testing.T) {
	proc := collector.Process{
		PID:        202,
		Name:       "Code Helper",
		Executable: "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper.app/Contents/MacOS/Code Helper",
		StartTime:  time.Now().Add(-time.Minute),
	}

	// "VS Code is installed" is not AI usage.
	if d := Classify(appObs(proc, nil, nil), testConfig(), nil, nil); d.AIConfidence != 0 {
		t.Errorf("an idle editor must not score, got %v", d.AIConfidence)
	}

	// The same editor talking to Copilot is.
	d := Classify(appObs(proc, nil, []collector.Connection{conn("api.githubcopilot.com", 443)}), testConfig(), nil, nil)
	if d.AIConfidence < aiHigh {
		t.Errorf("editor with provider connectivity should score, got %v", d.AIConfidence)
	}
	if d.Provider != "github_copilot" {
		t.Errorf("expected github_copilot, got %q", d.Provider)
	}
}

func TestClassify_HarnessChildInheritsOnlyWithItsOwnTraffic(t *testing.T) {
	parent := collector.Process{PID: 300, Name: "codex", Executable: "/Users/x/.codex/bin/codex"}

	// A `ps` the harness shelled out to is a tool call, not a workload.
	quiet := Classify(appObs(collector.Process{PID: 301, Name: "ps", Executable: "/bin/ps"}, []collector.Process{parent}, nil), testConfig(), nil, nil)
	if quiet.AIConfidence != 0 || quiet.AgentConfidence != 0 {
		t.Errorf("a childless tool call must not inherit the harness's classification, got %+v", quiet)
	}

	// A helper the harness spawned that is itself talking to an API is.
	busy := Classify(appObs(
		collector.Process{PID: 302, Name: "node", Executable: "/opt/homebrew/bin/node", Command: "node ./worker.js"},
		[]collector.Process{parent},
		[]collector.Connection{conn("93.184.216.34", 443)},
	), testConfig(), nil, nil)
	if busy.Application != "openai_codex" {
		t.Fatalf("expected attribution to openai_codex, got %q", busy.Application)
	}
	// Weaker than a direct match, deliberately.
	if busy.AIConfidence >= aiHigh {
		t.Errorf("an ancestor-derived match should be weaker than a direct one, got %v", busy.AIConfidence)
	}
}

func TestClassify_ProviderIndexMatchesBareIP(t *testing.T) {
	// api.anthropic.com publishes no PTR record, so the reverse-DNS path finds
	// nothing and this connection used to score zero.
	idx := collector.NewProviderIndex(nil, time.Hour, time.Second, nil)
	idx.Seed("160.79.104.10", "anthropic")

	o := obs(collector.Process{PID: 400, Name: "python3", Command: "python3 batch.py", StartTime: time.Now().Add(-time.Minute)},
		nil, []collector.Connection{conn("160.79.104.10", 443)}, nil)

	d := Classify(o, testConfig(), nil, idx)

	if d.Provider != "anthropic" {
		t.Fatalf("expected the IP index to attribute the connection, got %q", d.Provider)
	}
	if d.AIConfidence == 0 {
		t.Fatal("expected non-zero AI confidence")
	}
	// Below a hostname match: CDN address space is shared.
	if d.AIConfidence >= aiHigh {
		t.Errorf("an IP-index match should carry less weight than a hostname match, got %v", d.AIConfidence)
	}
}

func TestClassify_CrashHandlerInsideAnAIBundleIsIgnored(t *testing.T) {
	o := appObs(collector.Process{
		PID:        401,
		Name:       "chrome_crashpad_handler",
		Executable: "/Applications/Claude.app/Contents/Frameworks/chrome_crashpad_handler",
		StartTime:  time.Now().Add(-time.Minute),
	}, nil, nil)

	if d := Classify(o, testConfig(), nil, nil); d.AIConfidence != 0 || d.Application != "" {
		t.Errorf("an app's crash reporter is not the AI workload, got %+v", d)
	}
}
