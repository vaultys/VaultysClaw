package vconn

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// TestClient_RealControlPlaneProtocol drives internal/vconn/client.go
// against a minimal hand-rolled mock of the real control plane's exact
// wire sequence (packages/controlplane/lib/ws-server.ts: nothing until
// register → ack → real handshake → registration_pending → auth_complete —
// there is no proactive greeting; the real server sends nothing at all
// until it receives "register") rather than the standalone collector's
// server.go. This proves the sensor's register/kind step is compatible
// with the real system, not just the reference collector used by the
// other tests in this package.
func TestClient_RealControlPlaneProtocol(t *testing.T) {
	serverID := newTestIdentity(t)
	sensorID := newTestIdentity(t)

	upgrader := websocket.Upgrader{}
	registeredKind := make(chan string, 1)

	httpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade: %v", err)
			return
		}
		defer conn.Close()

		sessionID := "test-session"

		var reg Envelope
		if err := conn.ReadJSON(&reg); err != nil {
			t.Errorf("read register: %v", err)
			return
		}
		if reg.Type != MsgRegister {
			t.Errorf("expected register message, got %q", reg.Type)
			return
		}
		var regPayload RegisterPayload
		_ = reg.Decode(&regPayload)
		registeredKind <- regPayload.Kind

		ack, _ := NewEnvelope(MsgAuthChallenge, AuthChallengePayload{SessionID: sessionID, Data: ""})
		if err := conn.WriteJSON(ack); err != nil {
			t.Errorf("write register ack: %v", err)
			return
		}

		hs := NewHandshake(serverID.VaultysID())
		for !hs.IsComplete() {
			var env Envelope
			if err := conn.ReadJSON(&env); err != nil {
				t.Errorf("read handshake: %v", err)
				return
			}
			var payload AuthChallengePayload
			_ = env.Decode(&payload)
			nextB64, err := hs.Accept(payload.Data)
			if err != nil {
				t.Errorf("hs.Accept: %v", err)
				return
			}
			if nextB64 != "" {
				resp, _ := NewEnvelope(MsgAuthChallenge, AuthChallengePayload{SessionID: sessionID, Data: nextB64})
				if err := conn.WriteJSON(resp); err != nil {
					t.Errorf("write handshake response: %v", err)
					return
				}
			}
		}

		// Mirror the real control plane's unknown-DID path (registration_pending)
		// then move straight to auth_complete — this test only proves wire
		// compatibility, not the admin-approval workflow itself (that's
		// exercised end-to-end against the standalone collector elsewhere
		// in this package).
		pending, _ := NewEnvelope(MsgRegistrationPending, RegistrationPendingPayload{RegistrationID: "reg1", Message: "pending"})
		if err := conn.WriteJSON(pending); err != nil {
			t.Errorf("write registration_pending: %v", err)
			return
		}

		did, err := hs.RemoteDID()
		if err != nil {
			t.Errorf("hs.RemoteDID: %v", err)
			return
		}
		complete, _ := NewEnvelope(MsgAuthComplete, AuthCompletePayload{DID: did})
		if err := conn.WriteJSON(complete); err != nil {
			t.Errorf("write auth_complete: %v", err)
			return
		}

		// Keep the connection open briefly so the client's background
		// reader doesn't see a close and reconnect mid-assertion.
		time.Sleep(200 * time.Millisecond)
	}))
	defer httpSrv.Close()

	client := NewClientConn(ClientConfig{
		CollectorURL: httpSrv.URL,
		Identity:     sensorID,
		Name:         "test-device",
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go client.Run(ctx)

	select {
	case kind := <-registeredKind:
		if kind != "sensor" {
			t.Fatalf("expected register kind=sensor, got %q", kind)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("mock server never received a register message")
	}
}
