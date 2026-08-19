package vconn

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/VaultysClaw/sdk-go/telemetry"
	sdkvconn "github.com/vaultys/VaultysClaw/sdk-go/vconn"
	"github.com/vaultys/vaultysclaw-sensor/internal/ingest"
)

func newTestIdentity(t *testing.T) *identity.Provider {
	t.Helper()
	p, err := identity.LoadOrCreate(t.TempDir() + "/identity.secret")
	if err != nil {
		t.Fatalf("identity.LoadOrCreate: %v", err)
	}
	return p
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func waitFor(t *testing.T, timeout time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition not met within timeout")
}

type testEnv struct {
	httpSrv  *httptest.Server
	store    *ingest.Store
	vconnSrv *Server
}

// setupCollector wires the real production stack — ingest.Store,
// vconn.Server, ingest.Server — behind a real httptest.Server, so these
// tests exercise the exact code path cmd/collector runs.
func setupCollector(t *testing.T) *testEnv {
	t.Helper()
	store := ingest.NewStore("")
	collectorID := newTestIdentity(t)
	vconnSrv := NewServer(store, collectorID, discardLogger())
	ingestSrv := ingest.NewServer(store, vconnSrv, vconnSrv, vconnSrv.HandleWS, discardLogger())
	httpSrv := httptest.NewServer(ingestSrv.Routes())
	t.Cleanup(httpSrv.Close)
	return &testEnv{httpSrv: httpSrv, store: store, vconnSrv: vconnSrv}
}

func TestE2E_UnknownDID_PendingApproveTelemetryFlow(t *testing.T) {
	env := setupCollector(t)
	sensorID := newTestIdentity(t)

	client := sdkvconn.NewClientConn(sdkvconn.ClientConfig{
		CollectorURL:  env.httpSrv.URL,
		Identity:      sensorID,
		BatchInterval: 50 * time.Millisecond,
		Logger:        discardLogger(),
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go client.Run(ctx)

	var did string
	waitFor(t, 3*time.Second, func() bool {
		pending := env.vconnSrv.ListPending()
		if len(pending) == 0 {
			return false
		}
		did = pending[0].DID
		return true
	})
	if did != sensorID.DID() {
		t.Fatalf("expected pending DID %s, got %s", sensorID.DID(), did)
	}

	resp, err := http.Post(env.httpSrv.URL+"/v1/pending/"+did+"/approve", "", nil)
	if err != nil {
		t.Fatalf("approve request: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 approving, got %d", resp.StatusCode)
	}

	evt := telemetry.NewEvent(telemetry.EventAIWorkloadDetected, time.Now(),
		telemetry.Device{ID: sensorID.DID(), Hostname: "test-host", OS: "darwin"},
		telemetry.Workload{Fingerprint: "fp1", AIConfidence: 0.9})
	client.Enqueue(evt)

	waitFor(t, 3*time.Second, func() bool {
		return len(env.store.ListWorkloads()) == 1
	})

	if len(env.vconnSrv.ListPending()) != 0 {
		t.Errorf("expected the pending entry to be cleared after approval, got %d", len(env.vconnSrv.ListPending()))
	}
}

func TestE2E_Reject_DeviceNeverBecomesKnown(t *testing.T) {
	env := setupCollector(t)
	sensorID := newTestIdentity(t)

	client := sdkvconn.NewClientConn(sdkvconn.ClientConfig{CollectorURL: env.httpSrv.URL, Identity: sensorID, Logger: discardLogger()})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go client.Run(ctx)

	waitFor(t, 3*time.Second, func() bool { return len(env.vconnSrv.ListPending()) == 1 })

	if err := env.vconnSrv.Reject(sensorID.DID(), "test rejection"); err != nil {
		t.Fatalf("reject: %v", err)
	}

	time.Sleep(100 * time.Millisecond) // default reconnect backoff is 1s; no retry expected yet
	if env.store.HasDevice(sensorID.DID()) {
		t.Error("did not expect a rejected device to become known")
	}
}

// TestE2E_KnownDID_AutoConnectsWithoutApproval exercises the "known DID
// auto-connects" behavior a real reconnect relies on: a second,
// independent connection from an already-approved identity should reach
// auth_complete straight away, with no new pending entry.
func TestE2E_KnownDID_AutoConnectsWithoutApproval(t *testing.T) {
	env := setupCollector(t)
	sensorID := newTestIdentity(t)

	client1 := sdkvconn.NewClientConn(sdkvconn.ClientConfig{CollectorURL: env.httpSrv.URL, Identity: sensorID, Logger: discardLogger()})
	ctx1, cancel1 := context.WithCancel(context.Background())
	go client1.Run(ctx1)

	waitFor(t, 3*time.Second, func() bool { return len(env.vconnSrv.ListPending()) == 1 })
	if err := env.vconnSrv.Approve(sensorID.DID()); err != nil {
		t.Fatalf("approve: %v", err)
	}
	waitFor(t, 3*time.Second, func() bool { return env.store.HasDevice(sensorID.DID()) })
	cancel1() // drop the first connection

	client2 := sdkvconn.NewClientConn(sdkvconn.ClientConfig{
		CollectorURL:  env.httpSrv.URL,
		Identity:      sensorID,
		BatchInterval: 50 * time.Millisecond,
		Logger:        discardLogger(),
	})
	ctx2, cancel2 := context.WithCancel(context.Background())
	defer cancel2()
	go client2.Run(ctx2)

	evt := telemetry.NewEvent(telemetry.EventAIWorkloadDetected, time.Now(),
		telemetry.Device{ID: sensorID.DID(), Hostname: "test-host", OS: "darwin"},
		telemetry.Workload{Fingerprint: "fp2", AIConfidence: 0.9})
	client2.Enqueue(evt)

	waitFor(t, 3*time.Second, func() bool {
		for _, w := range env.store.ListWorkloads() {
			if w.Fingerprint == "fp2" {
				return true
			}
		}
		return false
	})

	if len(env.vconnSrv.ListPending()) != 0 {
		t.Errorf("expected no pending entries for an already-approved DID, got %d", len(env.vconnSrv.ListPending()))
	}
}
