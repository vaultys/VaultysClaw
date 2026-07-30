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

	d := Classify(o, testConfig(), nil)

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

	d := Classify(o, testConfig(), nil)

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

	d := Classify(o, testConfig(), nil)

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

	d := Classify(o, testConfig(), nil)

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

	d := Classify(o, testConfig(), nil)

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

	d := Classify(o, testConfig(), nil)

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

	d := Classify(o, testConfig(), nil)

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

	d := Classify(o, testConfig(), nil)

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

func TestClassify_NoSignals_ZeroConfidence(t *testing.T) {
	o := obs(collector.Process{PID: 700, Name: "bash", Command: "bash -c ls"}, nil, nil, nil)

	d := Classify(o, testConfig(), nil)

	if d.AIConfidence != 0 || d.AgentConfidence != 0 {
		t.Errorf("expected zero confidence for an unrelated process, got AI=%v Agent=%v", d.AIConfidence, d.AgentConfidence)
	}
	if len(d.Reasons) != 0 {
		t.Errorf("expected no reasons, got %v", d.Reasons)
	}
}
