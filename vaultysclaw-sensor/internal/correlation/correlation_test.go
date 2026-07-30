package correlation

import (
	"testing"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/config"
)

func TestBuild_FiltersToProcessesWithSignals(t *testing.T) {
	cfg := config.DefaultSensorConfig()
	device := DeviceInfo{ID: "device-1", Hostname: "host", OS: "darwin"}

	processes := []collector.Process{
		{PID: 1, Name: "python3", Command: "python3 invoice-agent.py"}, // no connection, but "agent" naming -> candidate
		{PID: 2, Name: "bash", Command: "bash -c ls"},                  // no signal at all -> excluded
		{PID: 3, Name: "node", Command: "node server.js"},              // has a connection -> candidate
	}
	connections := []collector.Connection{
		{PID: 3, RemoteHost: "api.openai.com", RemotePort: 443, State: collector.ConnEstablished},
	}

	obs := Build(device, processes, connections, cfg)

	if len(obs) != 2 {
		t.Fatalf("expected 2 candidate observations, got %d", len(obs))
	}
	pids := map[int]bool{}
	for _, o := range obs {
		pids[o.Process.PID] = true
	}
	if !pids[1] || !pids[3] {
		t.Errorf("expected PIDs 1 and 3 to be candidates, got %+v", pids)
	}
	if pids[2] {
		t.Error("did not expect the unrelated bash process to be a candidate")
	}
}

func TestBuild_GroupsChildrenByParentPID(t *testing.T) {
	cfg := config.DefaultSensorConfig()
	device := DeviceInfo{ID: "device-1", Hostname: "host", OS: "darwin"}

	processes := []collector.Process{
		{PID: 100, PPID: 0, Name: "node", Command: "node sales-agent.js"},
		{PID: 101, PPID: 100, Name: "node", Command: "npx @modelcontextprotocol/server-salesforce"},
	}
	connections := []collector.Connection{
		{PID: 100, RemoteHost: "api.anthropic.com", RemotePort: 443, State: collector.ConnEstablished},
	}

	obs := Build(device, processes, connections, cfg)

	var parent *Observation
	for i := range obs {
		if obs[i].Process.PID == 100 {
			parent = &obs[i]
		}
	}
	if parent == nil {
		t.Fatal("expected an observation for the parent process")
	}
	if len(parent.Children) != 1 || parent.Children[0].PID != 101 {
		t.Errorf("expected the MCP child process to be attached, got %+v", parent.Children)
	}
}

func TestBuild_SeparatesListeningFromOutboundConnections(t *testing.T) {
	cfg := config.DefaultSensorConfig()
	device := DeviceInfo{ID: "device-1", Hostname: "host", OS: "darwin"}

	processes := []collector.Process{{PID: 1, Name: "ollama", Command: "ollama serve"}}
	connections := []collector.Connection{
		{PID: 1, LocalPort: 11434, State: collector.ConnListen},
	}

	obs := Build(device, processes, connections, cfg)
	if len(obs) != 1 {
		t.Fatalf("expected 1 observation, got %d", len(obs))
	}
	if len(obs[0].Connections) != 0 {
		t.Errorf("expected zero outbound connections, got %d", len(obs[0].Connections))
	}
	if len(obs[0].ListeningPorts) != 1 || obs[0].ListeningPorts[0] != 11434 {
		t.Errorf("expected listening port 11434, got %v", obs[0].ListeningPorts)
	}
}

func TestBuild_EmptyInput_NoObservations(t *testing.T) {
	cfg := config.DefaultSensorConfig()
	device := DeviceInfo{ID: "device-1", Hostname: "host", OS: "darwin"}
	if obs := Build(device, nil, nil, cfg); len(obs) != 0 {
		t.Errorf("expected no observations for empty input, got %d", len(obs))
	}
}
