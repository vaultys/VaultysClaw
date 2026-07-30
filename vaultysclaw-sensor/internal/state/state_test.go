package state

import (
	"testing"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/detector"
	"github.com/vaultys/vaultysclaw-sensor/internal/telemetry"
)

func TestComputeFingerprint_StableAcrossPIDChange(t *testing.T) {
	fp1 := ComputeFingerprint("/usr/bin/python3", "python3 invoice-agent.py", "fx", "openai", "device-1")
	fp2 := ComputeFingerprint("/usr/bin/python3", "python3 invoice-agent.py", "fx", "openai", "device-1")
	if fp1 != fp2 {
		t.Fatalf("expected identical fingerprints for identical attributes, got %s vs %s", fp1, fp2)
	}
}

func TestComputeFingerprint_DiffersOnProvider(t *testing.T) {
	fp1 := ComputeFingerprint("/usr/bin/python3", "python3 invoice-agent.py", "fx", "openai", "device-1")
	fp2 := ComputeFingerprint("/usr/bin/python3", "python3 invoice-agent.py", "fx", "anthropic", "device-1")
	if fp1 == fp2 {
		t.Fatal("expected different fingerprints for different providers")
	}
}

func newObs(fp Fingerprint, ai, agent float64, provider string, isMCP bool) CurrentObservation {
	return CurrentObservation{
		Fingerprint: fp,
		Process:     collector.Process{PID: 123, Name: "python3", Executable: "/usr/bin/python3", Command: "python3 invoice-agent.py"},
		Detection: detector.Detection{
			AIConfidence:    ai,
			AgentConfidence: agent,
			Provider:        provider,
			Reasons:         []string{"non-browser process connected to known AI API"},
			IsMCP:           isMCP,
		},
	}
}

func eventTypes(events []telemetry.Event) []telemetry.EventType {
	out := make([]telemetry.EventType, len(events))
	for i, e := range events {
		out[i] = e.Type
	}
	return out
}

func contains(types []telemetry.EventType, t telemetry.EventType) bool {
	for _, x := range types {
		if x == t {
			return true
		}
	}
	return false
}

func TestReconcile_FirstSighting_EmitsDetectedAndProvider(t *testing.T) {
	s := NewStore()
	device := telemetry.Device{ID: "device-1", Hostname: "host", OS: "darwin"}
	fp := ComputeFingerprint("/usr/bin/python3", "python3 invoice-agent.py", "fx", "openai", "device-1")

	events := s.Reconcile(time.Now(), device, []CurrentObservation{newObs(fp, 0.9, 0.5, "openai", false)})

	types := eventTypes(events)
	if !contains(types, telemetry.EventAIWorkloadDetected) {
		t.Errorf("expected ai_workload_detected, got %v", types)
	}
	if !contains(types, telemetry.EventProviderDetected) {
		t.Errorf("expected provider_detected on first sighting, got %v", types)
	}
	if s.Len() != 1 {
		t.Errorf("expected 1 tracked entry, got %d", s.Len())
	}
}

func TestReconcile_IdenticalSecondPoll_EmitsNothing(t *testing.T) {
	s := NewStore()
	device := telemetry.Device{ID: "device-1", Hostname: "host", OS: "darwin"}
	fp := ComputeFingerprint("/usr/bin/python3", "python3 invoice-agent.py", "fx", "openai", "device-1")

	s.Reconcile(time.Now(), device, []CurrentObservation{newObs(fp, 0.9, 0.5, "openai", false)})
	events := s.Reconcile(time.Now(), device, []CurrentObservation{newObs(fp, 0.9, 0.5, "openai", false)})

	if len(events) != 0 {
		t.Errorf("expected no events for an unchanged workload, got %v", eventTypes(events))
	}
}

func TestReconcile_MaterialConfidenceChange_EmitsUpdated(t *testing.T) {
	s := NewStore()
	device := telemetry.Device{ID: "device-1", Hostname: "host", OS: "darwin"}
	fp := ComputeFingerprint("/usr/bin/python3", "python3 invoice-agent.py", "fx", "openai", "device-1")

	s.Reconcile(time.Now(), device, []CurrentObservation{newObs(fp, 0.9, 0.5, "openai", false)})
	events := s.Reconcile(time.Now(), device, []CurrentObservation{newObs(fp, 0.9, 0.9, "openai", false)})

	types := eventTypes(events)
	if !contains(types, telemetry.EventAIWorkloadUpdated) {
		t.Errorf("expected ai_workload_updated on material agent-confidence change, got %v", types)
	}
}

func TestReconcile_TinyConfidenceJitter_NoUpdate(t *testing.T) {
	s := NewStore()
	device := telemetry.Device{ID: "device-1", Hostname: "host", OS: "darwin"}
	fp := ComputeFingerprint("/usr/bin/python3", "python3 invoice-agent.py", "fx", "openai", "device-1")

	s.Reconcile(time.Now(), device, []CurrentObservation{newObs(fp, 0.90, 0.50, "openai", false)})
	events := s.Reconcile(time.Now(), device, []CurrentObservation{newObs(fp, 0.91, 0.51, "openai", false)})

	if len(events) != 0 {
		t.Errorf("expected no events for sub-epsilon confidence jitter, got %v", eventTypes(events))
	}
}

func TestReconcile_MissingNextPoll_EmitsStopped(t *testing.T) {
	s := NewStore()
	device := telemetry.Device{ID: "device-1", Hostname: "host", OS: "darwin"}
	fp := ComputeFingerprint("/usr/bin/python3", "python3 invoice-agent.py", "fx", "openai", "device-1")

	s.Reconcile(time.Now(), device, []CurrentObservation{newObs(fp, 0.9, 0.5, "openai", false)})
	events := s.Reconcile(time.Now(), device, nil)

	types := eventTypes(events)
	if !contains(types, telemetry.EventAIWorkloadStopped) {
		t.Errorf("expected ai_workload_stopped when a workload disappears, got %v", types)
	}
	if s.Len() != 0 {
		t.Errorf("expected the stopped entry to be removed from state, got %d entries", s.Len())
	}
}

func TestReconcile_NewlyMCP_EmitsMCPServerDetectedOnce(t *testing.T) {
	s := NewStore()
	device := telemetry.Device{ID: "device-1", Hostname: "host", OS: "darwin"}
	fp := ComputeFingerprint("/usr/bin/node", "node sales-agent.js", "fx", "anthropic", "device-1")

	base := newObs(fp, 0.9, 0.5, "anthropic", false)
	events1 := s.Reconcile(time.Now(), device, []CurrentObservation{base})
	if contains(eventTypes(events1), telemetry.EventMCPServerDetected) {
		t.Errorf("did not expect mcp_server_detected before MCP appears")
	}

	withMCP := newObs(fp, 0.9, 0.9, "anthropic", true)
	events2 := s.Reconcile(time.Now(), device, []CurrentObservation{withMCP})
	if !contains(eventTypes(events2), telemetry.EventMCPServerDetected) {
		t.Errorf("expected mcp_server_detected on the transition to MCP, got %v", eventTypes(events2))
	}

	// Third poll still MCP, no new transition -> no duplicate mcp_server_detected.
	events3 := s.Reconcile(time.Now(), device, []CurrentObservation{withMCP})
	if contains(eventTypes(events3), telemetry.EventMCPServerDetected) {
		t.Errorf("did not expect a duplicate mcp_server_detected, got %v", eventTypes(events3))
	}
}

func TestReconcile_NeverIdenticalObservationEverySingleCycle(t *testing.T) {
	// Regression guard for "avoid sending identical observations every
	// polling interval": ten unchanged polls in a row should produce
	// exactly one detected event and nothing else.
	s := NewStore()
	device := telemetry.Device{ID: "device-1", Hostname: "host", OS: "darwin"}
	fp := ComputeFingerprint("/usr/bin/python3", "python3 invoice-agent.py", "fx", "openai", "device-1")

	total := 0
	for i := 0; i < 10; i++ {
		events := s.Reconcile(time.Now(), device, []CurrentObservation{newObs(fp, 0.9, 0.5, "openai", false)})
		total += len(events)
	}
	if total != 2 { // ai_workload_detected + provider_detected, once
		t.Errorf("expected exactly 2 events across 10 identical polls, got %d", total)
	}
}
