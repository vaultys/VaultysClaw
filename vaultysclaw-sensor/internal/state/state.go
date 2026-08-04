// Package state maintains the sensor's in-memory view of currently
// observed workloads and turns each poll cycle's classifications into
// deltas — never re-sending an identical observation, and reporting when
// something appears, materially changes, or disappears.
package state

import (
	"crypto/sha256"
	"encoding/hex"
	"math"
	"strings"
	"sync"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/detector"
	"github.com/vaultys/vaultysclaw-sensor/internal/telemetry"
)

// Fingerprint stably identifies a workload across poll cycles. Never
// derived from PID, which is transient.
type Fingerprint string

// ComputeFingerprint derives a workload's identity from attributes that
// persist across process restarts.
func ComputeFingerprint(executable, command, user, provider, deviceID string) Fingerprint {
	h := sha256.New()
	for _, part := range []string{executable, strings.TrimSpace(command), user, provider, deviceID} {
		h.Write([]byte(part))
		h.Write([]byte{0})
	}
	return Fingerprint(hex.EncodeToString(h.Sum(nil)))
}

// CurrentObservation is one classified workload from the current poll
// cycle, ready to be reconciled against prior state.
type CurrentObservation struct {
	Fingerprint Fingerprint
	Process     collector.Process
	Detection   detector.Detection
}

// confidenceEpsilon is the minimum confidence delta considered a material
// change worth an ai_workload_updated event — avoids emitting noise from
// float rounding jitter between identical polls.
const confidenceEpsilon = 0.05

type trackedEntry struct {
	detection       detector.Detection
	process         collector.Process
	firstSeen       time.Time
	lastSeen        time.Time
	emittedMCP      bool
	emittedRuntime  bool
	emittedProvider bool
}

// Store holds current workload state in memory. Not persisted across
// restarts by design — a restart simply re-detects and re-emits
// ai_workload_detected for anything still running, which is harmless.
type Store struct {
	mu               sync.Mutex
	entries          map[Fingerprint]*trackedEntry
	agentIdentityDID string
}

func NewStore() *Store {
	return &Store{entries: make(map[Fingerprint]*trackedEntry)}
}

// SetAgentIdentityDID updates the locally-known agent identity (see
// config.Sensor.AgentIdentityPath), attached as IdentityEvidence on any
// workload whose classification matched a known agent framework. Safe to
// call concurrently with Reconcile — cheap enough to call every poll cycle
// so picking up the identity file after the sensor starts, or losing it,
// takes effect on the next cycle rather than requiring a restart.
func (s *Store) SetAgentIdentityDID(did string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.agentIdentityDID = did
}

// Reconcile compares the current cycle's observations against prior
// state, updates internal state, and returns exactly the telemetry events
// that changed — never a full snapshot.
func (s *Store) Reconcile(now time.Time, device telemetry.Device, current []CurrentObservation) []telemetry.Event {
	s.mu.Lock()
	defer s.mu.Unlock()

	var events []telemetry.Event
	seen := make(map[Fingerprint]struct{}, len(current))

	for _, c := range current {
		seen[c.Fingerprint] = struct{}{}
		workload := buildWorkload(c.Fingerprint, c.Process, c.Detection, s.agentIdentityDID)

		existing, ok := s.entries[c.Fingerprint]
		if !ok {
			s.entries[c.Fingerprint] = &trackedEntry{
				detection:       c.Detection,
				process:         c.Process,
				firstSeen:       now,
				lastSeen:        now,
				emittedMCP:      c.Detection.IsMCP,
				emittedRuntime:  c.Detection.IsLocalRuntime,
				emittedProvider: c.Detection.Provider != "",
			}
			events = append(events, telemetry.NewEvent(telemetry.EventAIWorkloadDetected, now, device, workload))
			if c.Detection.IsMCP {
				events = append(events, telemetry.NewEvent(telemetry.EventMCPServerDetected, now, device, workload))
			}
			if c.Detection.IsLocalRuntime {
				events = append(events, telemetry.NewEvent(telemetry.EventLocalModelRuntimeDetected, now, device, workload))
			}
			if c.Detection.Provider != "" {
				events = append(events, telemetry.NewEvent(telemetry.EventProviderDetected, now, device, workload))
			}
			continue
		}

		materialChange := math.Abs(existing.detection.AIConfidence-c.Detection.AIConfidence) > confidenceEpsilon ||
			math.Abs(existing.detection.AgentConfidence-c.Detection.AgentConfidence) > confidenceEpsilon ||
			existing.detection.Provider != c.Detection.Provider ||
			!reasonsEqual(existing.detection.Reasons, c.Detection.Reasons)

		newlyMCP := c.Detection.IsMCP && !existing.emittedMCP
		newlyRuntime := c.Detection.IsLocalRuntime && !existing.emittedRuntime
		newlyProvider := c.Detection.Provider != "" && !existing.emittedProvider

		existing.detection = c.Detection
		existing.process = c.Process
		existing.lastSeen = now
		if newlyMCP {
			existing.emittedMCP = true
		}
		if newlyRuntime {
			existing.emittedRuntime = true
		}
		if newlyProvider {
			existing.emittedProvider = true
		}

		if materialChange {
			events = append(events, telemetry.NewEvent(telemetry.EventAIWorkloadUpdated, now, device, workload))
		}
		if newlyMCP {
			events = append(events, telemetry.NewEvent(telemetry.EventMCPServerDetected, now, device, workload))
		}
		if newlyRuntime {
			events = append(events, telemetry.NewEvent(telemetry.EventLocalModelRuntimeDetected, now, device, workload))
		}
		if newlyProvider {
			events = append(events, telemetry.NewEvent(telemetry.EventProviderDetected, now, device, workload))
		}
	}

	for fp, entry := range s.entries {
		if _, ok := seen[fp]; ok {
			continue
		}
		workload := buildWorkload(fp, entry.process, entry.detection, s.agentIdentityDID)
		events = append(events, telemetry.NewEvent(telemetry.EventAIWorkloadStopped, now, device, workload))
		delete(s.entries, fp)
	}

	return events
}

// Len reports how many workloads are currently tracked (test/debug aid).
func (s *Store) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.entries)
}

func buildWorkload(fp Fingerprint, proc collector.Process, d detector.Detection, agentIdentityDID string) telemetry.Workload {
	w := telemetry.Workload{
		Fingerprint: string(fp),
		Process: telemetry.ProcessInfo{
			Name:       proc.Name,
			PID:        proc.PID,
			Executable: proc.Executable,
			Command:    proc.Command,
			User:       proc.User,
		},
		Provider:        d.Provider,
		AIConfidence:    d.AIConfidence,
		AgentConfidence: d.AgentConfidence,
		Reasons:         d.Reasons,
		IsMCP:           d.IsMCP,
		MCPServers:      d.MCPServers,
		IsLocalRuntime:  d.IsLocalRuntime,
	}
	// Only a workload actually classified as a known agent framework gets
	// identity evidence attached — an unrelated process shouldn't borrow the
	// locally-configured agent's DID just because one happens to be present
	// on the same machine.
	if d.AgentFramework != "" && agentIdentityDID != "" {
		w.IdentityEvidence = agentIdentityDID
	}
	return w
}

func reasonsEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
