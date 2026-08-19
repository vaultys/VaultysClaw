package ingest

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/telemetry"
)

func TestStore_UpsertWorkload_ComputesShadowStatus(t *testing.T) {
	store := NewStore("")
	now := time.Now()
	evt := telemetry.NewEvent(telemetry.EventAIWorkloadDetected, now,
		telemetry.Device{ID: "device-1", Hostname: "host", OS: "darwin"},
		telemetry.Workload{Fingerprint: "fp1", AgentConfidence: 0.9, AIConfidence: 0.95})

	store.UpsertDevice(evt.Device, now)
	store.UpsertWorkload("device-1", evt, now)

	workloads := store.ListWorkloads()
	if len(workloads) != 1 {
		t.Fatalf("expected 1 workload, got %d", len(workloads))
	}
	if workloads[0].Status != "shadow" {
		t.Errorf("expected status shadow for agentConfidence=0.9, got %s", workloads[0].Status)
	}
}

func TestStore_UpsertWorkload_ComputesObservedStatus(t *testing.T) {
	store := NewStore("")
	now := time.Now()
	evt := telemetry.NewEvent(telemetry.EventAIWorkloadDetected, now,
		telemetry.Device{ID: "device-1", Hostname: "host", OS: "darwin"},
		telemetry.Workload{Fingerprint: "fp2", AgentConfidence: 0.1, AIConfidence: 0.9})

	store.UpsertDevice(evt.Device, now)
	store.UpsertWorkload("device-1", evt, now)

	workloads := store.ListWorkloads()
	if workloads[0].Status != "observed" {
		t.Errorf("expected status observed for agentConfidence=0.1, got %s", workloads[0].Status)
	}
}

func TestStore_StoppedEvent_RemovesWorkload(t *testing.T) {
	store := NewStore("")
	now := time.Now()
	device := telemetry.Device{ID: "device-1", Hostname: "host", OS: "darwin"}
	detected := telemetry.NewEvent(telemetry.EventAIWorkloadDetected, now, device, telemetry.Workload{Fingerprint: "fp3", AIConfidence: 0.9})
	store.UpsertWorkload("device-1", detected, now)

	stopped := telemetry.NewEvent(telemetry.EventAIWorkloadStopped, now, device, telemetry.Workload{Fingerprint: "fp3"})
	store.UpsertWorkload("device-1", stopped, now)

	if len(store.ListWorkloads()) != 0 {
		t.Errorf("expected the workload to be removed after a stopped event")
	}
}

func TestStore_HasDevice_And_EnsureDevice(t *testing.T) {
	store := NewStore("")
	const did = "did:vaultys:abc123"

	if store.HasDevice(did) {
		t.Fatal("did not expect a fresh store to already have this device")
	}

	store.EnsureDevice(did, time.Now())
	if !store.HasDevice(did) {
		t.Fatal("expected HasDevice to be true after EnsureDevice")
	}

	// EnsureDevice should not clobber an existing record.
	devices := store.ListDevices()
	if len(devices) != 1 {
		t.Fatalf("expected 1 device, got %d", len(devices))
	}
	first := devices[0].FirstSeen
	store.EnsureDevice(did, time.Now().Add(time.Hour))
	if store.ListDevices()[0].FirstSeen != first {
		t.Error("expected EnsureDevice to be a no-op for an existing device")
	}
}

func TestStore_SnapshotRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/state.json"

	store := NewStore(path)
	now := time.Now()
	device := telemetry.Device{ID: "did:vaultys:abc123", Hostname: "host", OS: "darwin"}
	evt := telemetry.NewEvent(telemetry.EventAIWorkloadDetected, now, device, telemetry.Workload{Fingerprint: "fp4", AIConfidence: 0.9})
	store.UpsertDevice(device, now)
	store.UpsertWorkload(device.ID, evt, now)

	if err := store.Snapshot(); err != nil {
		t.Fatalf("snapshot: %v", err)
	}

	reloaded := NewStore(path)
	if len(reloaded.ListDevices()) != 1 {
		t.Fatalf("expected 1 device after reload, got %d", len(reloaded.ListDevices()))
	}
	if len(reloaded.ListWorkloads()) != 1 {
		t.Fatalf("expected 1 workload after reload, got %d", len(reloaded.ListWorkloads()))
	}
	if !reloaded.HasDevice(device.ID) {
		t.Error("expected the device to survive a snapshot round-trip")
	}
}

// fakePendingApprover is a minimal PendingLister+Approver test double —
// the real implementation (vconn.Server) can't be constructed here
// without a live connection, and testing the ingest HTTP layer shouldn't
// need one.
type fakePendingApprover struct {
	list       []PendingInfo
	approved   []string
	rejected   []string
	approveErr error
	rejectErr  error
}

func (f *fakePendingApprover) ListPending() []PendingInfo { return f.list }

func (f *fakePendingApprover) Approve(did string) error {
	if f.approveErr != nil {
		return f.approveErr
	}
	f.approved = append(f.approved, did)
	return nil
}

func (f *fakePendingApprover) Reject(did string, reason string) error {
	if f.rejectErr != nil {
		return f.rejectErr
	}
	f.rejected = append(f.rejected, did)
	return nil
}

func TestServer_HandlePendingList(t *testing.T) {
	store := NewStore("")
	fake := &fakePendingApprover{list: []PendingInfo{{DID: "did:vaultys:xyz", FirstSeen: time.Now()}}}
	srv := NewServer(store, fake, fake, func(w http.ResponseWriter, r *http.Request) {}, nil)

	req := httptest.NewRequest(http.MethodGet, "/v1/pending", nil)
	rec := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !contains(rec.Body.String(), "did:vaultys:xyz") {
		t.Errorf("expected pending DID in response, got %s", rec.Body.String())
	}
}

func TestServer_HandlePendingApprove(t *testing.T) {
	store := NewStore("")
	fake := &fakePendingApprover{}
	srv := NewServer(store, fake, fake, func(w http.ResponseWriter, r *http.Request) {}, nil)

	req := httptest.NewRequest(http.MethodPost, "/v1/pending/did:vaultys:xyz/approve", nil)
	rec := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(fake.approved) != 1 || fake.approved[0] != "did:vaultys:xyz" {
		t.Errorf("expected did:vaultys:xyz to be approved, got %v", fake.approved)
	}
}

func TestServer_HandlePendingApprove_NotFound(t *testing.T) {
	store := NewStore("")
	fake := &fakePendingApprover{approveErr: errors.New("not found")}
	srv := NewServer(store, fake, fake, func(w http.ResponseWriter, r *http.Request) {}, nil)

	req := httptest.NewRequest(http.MethodPost, "/v1/pending/did:vaultys:unknown/approve", nil)
	rec := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

func TestServer_HandleDevicesAndWorkloads(t *testing.T) {
	store := NewStore("")
	now := time.Now()
	device := telemetry.Device{ID: "did:vaultys:abc", Hostname: "host", OS: "darwin"}
	evt := telemetry.NewEvent(telemetry.EventAIWorkloadDetected, now, device, telemetry.Workload{Fingerprint: "fp1", AIConfidence: 0.9})
	store.UpsertDevice(device, now)
	store.UpsertWorkload(device.ID, evt, now)

	fake := &fakePendingApprover{}
	srv := NewServer(store, fake, fake, func(w http.ResponseWriter, r *http.Request) {}, nil)

	for _, path := range []string{"/v1/devices", "/v1/workloads", "/"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		srv.Routes().ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("GET %s: expected 200, got %d", path, rec.Code)
		}
	}
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (func() bool {
		for i := 0; i+len(needle) <= len(haystack); i++ {
			if haystack[i:i+len(needle)] == needle {
				return true
			}
		}
		return false
	})()
}
