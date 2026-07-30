// Package ingest implements the standalone reference collector's receiving
// side: an in-memory device/workload store (with periodic JSON snapshot
// for restart survival), request authentication, and HTTP handlers. This
// is intentionally a demo-grade stand-in for real ingestion — see
// docs/vaultysclaw-integration.md for how it maps onto a future
// VaultysClaw control-plane integration.
package ingest

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/telemetry"
)

// Device is the collector's view of a sensor installation. ID is the
// device's real VaultysId DID ("did:vaultys:...") — the connection
// handshake (see internal/vconn) cryptographically proves possession of
// the corresponding private key on every connection, so there's no
// separate public-key pinning to track here anymore.
type Device struct {
	ID        string    `json:"id"`
	Hostname  string    `json:"hostname"`
	OS        string    `json:"os"`
	FirstSeen time.Time `json:"firstSeen"`
	LastSeen  time.Time `json:"lastSeen"`
}

// Workload is the collector's current-state view of one classified
// workload. Status is only ever "observed" or "shadow" here — "managed"
// requires correlating against VaultysClaw's real Agent registry, which
// this standalone collector deliberately doesn't have (see
// docs/vaultysclaw-integration.md).
type Workload struct {
	Fingerprint     string    `json:"fingerprint"`
	DeviceID        string    `json:"deviceId"`
	ProcessName     string    `json:"processName"`
	Executable      string    `json:"executable"`
	Command         string    `json:"command"`
	User            string    `json:"user"`
	Provider        string    `json:"provider"`
	Model           string    `json:"model"`
	AIConfidence    float64   `json:"aiConfidence"`
	AgentConfidence float64   `json:"agentConfidence"`
	Reasons         []string  `json:"reasons"`
	IsMCP           bool      `json:"isMcp"`
	MCPServers      []string  `json:"mcpServers"`
	IsLocalRuntime  bool      `json:"isLocalRuntime"`
	Status          string    `json:"status"`
	LastEventType   string    `json:"lastEventType"`
	FirstSeen       time.Time `json:"firstSeen"`
	LastSeen        time.Time `json:"lastSeen"`
}

// shadowThreshold: workloads at or above this agent confidence are
// surfaced as "shadow" (high-confidence agent, no known owner) rather than
// merely "observed".
const shadowThreshold = 0.75

type snapshot struct {
	Devices   map[string]*Device   `json:"devices"`
	Workloads map[string]*Workload `json:"workloads"`
}

// Store holds current device/workload state in memory, snapshotted to a
// local JSON file so state survives a collector restart. No SQL
// dependency, no cgo — deliberately minimal for a reference/demo backend.
type Store struct {
	mu           sync.RWMutex
	devices      map[string]*Device
	workloads    map[string]*Workload // key = deviceID + "/" + fingerprint
	snapshotPath string
}

func NewStore(snapshotPath string) *Store {
	s := &Store{
		devices:      make(map[string]*Device),
		workloads:    make(map[string]*Workload),
		snapshotPath: snapshotPath,
	}
	s.loadSnapshot()
	return s
}

func (s *Store) loadSnapshot() {
	if s.snapshotPath == "" {
		return
	}
	data, err := os.ReadFile(s.snapshotPath)
	if err != nil {
		return // no snapshot yet, or unreadable — start fresh
	}
	var snap snapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		return
	}
	if snap.Devices != nil {
		s.devices = snap.Devices
	}
	if snap.Workloads != nil {
		s.workloads = snap.Workloads
	}
}

// Snapshot writes current state to disk atomically (write to a temp file,
// then rename).
func (s *Store) Snapshot() error {
	s.mu.RLock()
	data, err := json.MarshalIndent(snapshot{Devices: s.devices, Workloads: s.workloads}, "", "  ")
	s.mu.RUnlock()
	if err != nil {
		return err
	}
	if s.snapshotPath == "" {
		return nil
	}
	if dir := filepath.Dir(s.snapshotPath); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return err
		}
	}
	tmp := s.snapshotPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.snapshotPath)
}

// StartSnapshotLoop periodically snapshots until ctx is cancelled, taking
// one final snapshot on the way out.
func (s *Store) StartSnapshotLoop(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			_ = s.Snapshot()
			return
		case <-ticker.C:
			_ = s.Snapshot()
		}
	}
}

// HasDevice reports whether did has an existing device record — meaning
// it has been approved at least once before, so a fresh connection from
// the same DID should auto-connect rather than go through pending
// approval again (mirrors the real system's "known DID auto-approves").
func (s *Store) HasDevice(did string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.devices[did]
	return ok
}

// EnsureDevice creates a bare device record for did if one doesn't exist
// yet (called on approval, before any telemetry has arrived to populate
// hostname/OS via UpsertDevice).
func (s *Store) EnsureDevice(did string, now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.devices[did]; !ok {
		s.devices[did] = &Device{ID: did, FirstSeen: now, LastSeen: now}
	}
}

// UpsertDevice records/refreshes device metadata from a telemetry event.
func (s *Store) UpsertDevice(dev telemetry.Device, now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, ok := s.devices[dev.ID]
	if !ok {
		d = &Device{ID: dev.ID, FirstSeen: now}
		s.devices[dev.ID] = d
	}
	d.Hostname = dev.Hostname
	d.OS = dev.OS
	d.LastSeen = now
}

// UpsertWorkload applies one telemetry event to workload state, keyed by
// (deviceID, fingerprint) — current state, not an append-only log. An
// ai_workload_stopped event removes the entry.
func (s *Store) UpsertWorkload(deviceID string, evt telemetry.Event, now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := deviceID + "/" + evt.Workload.Fingerprint
	if evt.Type == telemetry.EventAIWorkloadStopped {
		delete(s.workloads, key)
		return
	}

	w, ok := s.workloads[key]
	if !ok {
		w = &Workload{Fingerprint: evt.Workload.Fingerprint, DeviceID: deviceID, FirstSeen: now}
		s.workloads[key] = w
	}
	w.ProcessName = evt.Workload.Process.Name
	w.Executable = evt.Workload.Process.Executable
	w.Command = evt.Workload.Process.Command
	w.User = evt.Workload.Process.User
	w.Provider = evt.Workload.Provider
	w.Model = evt.Workload.Model
	w.AIConfidence = evt.Workload.AIConfidence
	w.AgentConfidence = evt.Workload.AgentConfidence
	w.Reasons = evt.Workload.Reasons
	w.IsMCP = evt.Workload.IsMCP
	w.MCPServers = evt.Workload.MCPServers
	w.IsLocalRuntime = evt.Workload.IsLocalRuntime
	w.LastEventType = string(evt.Type)
	w.LastSeen = now
	w.Status = computeStatus(w.AgentConfidence)
}

func computeStatus(agentConfidence float64) string {
	if agentConfidence >= shadowThreshold {
		return "shadow"
	}
	return "observed"
}

// ListDevices returns a snapshot copy of all devices, most-recently-seen
// first.
func (s *Store) ListDevices() []*Device {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Device, 0, len(s.devices))
	for _, d := range s.devices {
		cp := *d
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].LastSeen.After(out[j].LastSeen) })
	return out
}

// ListWorkloads returns a snapshot copy of all workloads, most-recently-
// seen first.
func (s *Store) ListWorkloads() []*Workload {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Workload, 0, len(s.workloads))
	for _, w := range s.workloads {
		cp := *w
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].LastSeen.After(out[j].LastSeen) })
	return out
}
