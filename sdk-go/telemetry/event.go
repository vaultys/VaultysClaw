// Package telemetry defines the versioned wire schema shared by the sensor
// (producer) and the reference collector (consumer). Metadata only: no
// prompts, model responses, document contents, clipboard, keystrokes,
// screenshots, arbitrary file contents, or decrypted traffic ever appear
// here.
package telemetry

import "time"

// SchemaVersion is bumped whenever the Event shape changes incompatibly.
const SchemaVersion = 1

// EventType identifies what changed since the previous poll cycle. The
// sensor emits deltas, never full snapshots.
type EventType string

const (
	EventAIWorkloadDetected        EventType = "ai_workload_detected"
	EventAIWorkloadUpdated         EventType = "ai_workload_updated"
	EventAIWorkloadStopped         EventType = "ai_workload_stopped"
	EventMCPServerDetected         EventType = "mcp_server_detected"
	EventLocalModelRuntimeDetected EventType = "local_model_runtime_detected"
	EventProviderDetected          EventType = "provider_detected"
)

// Device identifies the machine the sensor runs on. ID is derived from the
// sensor's local device identity (see internal/identity), not tied to any
// particular OS-level hardware serial.
type Device struct {
	ID       string `json:"id"`
	Hostname string `json:"hostname"`
	OS       string `json:"os"`
}

// ProcessInfo is the metadata-only process descriptor included on a
// workload. PID is informational only — never used as the dedup key, since
// PIDs are transient.
type ProcessInfo struct {
	Name       string `json:"name"`
	PID        int    `json:"pid"`
	Executable string `json:"executable,omitempty"`
	Command    string `json:"command,omitempty"`
	User       string `json:"user,omitempty"`
}

// Workload is a single classified AI/agent observation.
type Workload struct {
	Fingerprint     string      `json:"fingerprint"`
	Process         ProcessInfo `json:"process"`
	Provider        string      `json:"provider,omitempty"`
	Model           string      `json:"model,omitempty"`
	AIConfidence    float64     `json:"aiConfidence"`
	AgentConfidence float64     `json:"agentConfidence"`
	Reasons         []string    `json:"reasons"`
	IsMCP           bool        `json:"isMcp,omitempty"`
	MCPServers      []string    `json:"mcpServers,omitempty"`
	IsLocalRuntime  bool        `json:"isLocalRuntime,omitempty"`
	// IdentityEvidence carries any locally-observed VaultysClaw identity
	// evidence (e.g. a known agent identity file path found near the
	// process) so the control plane — never the sensor — can decide
	// whether this workload is "managed". See docs/vaultysclaw-integration.md.
	IdentityEvidence string `json:"identityEvidence,omitempty"`
}

// Event is a single telemetry envelope, versioned and signed at the
// transport layer (see internal/telemetry/client.go and internal/identity).
type Event struct {
	SchemaVersion int       `json:"schemaVersion"`
	Type          EventType `json:"type"`
	Timestamp     time.Time `json:"timestamp"`
	Device        Device    `json:"device"`
	Workload      Workload  `json:"workload"`
}

// Batch is the body of a POST /v1/telemetry request.
type Batch struct {
	Events []Event `json:"events"`
}

// NewEvent builds a well-formed Event with the current schema version.
func NewEvent(t EventType, ts time.Time, device Device, workload Workload) Event {
	return Event{
		SchemaVersion: SchemaVersion,
		Type:          t,
		Timestamp:     ts,
		Device:        device,
		Workload:      workload,
	}
}
