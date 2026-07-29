// Package agent implements the minimal VaultysClaw agent-controller runtime:
// WebSocket transport, VaultysID Challenger auth handshake, and the intent
// execution loop. It mirrors packages/sdk/src/base-agent.ts's protocol
// exactly (JSON envelope, not msgpack) so it plugs into the existing
// control plane unmodified.
package agent

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"runtime"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/vaultys/vaultysclaw/agent-controller-go/internal/cert"
	"github.com/vaultys/vaultysclaw/agent-controller-go/internal/protocol"
	"github.com/vaultys/vaultysid/go/pkg/challenger"
	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
)

// IntentHandler executes a control-plane intent and returns its output (or
// an error, which is reported back as a failed ExecutionResult).
type IntentHandler func(action string, params json.RawMessage, userDID string) (interface{}, error)

// Config configures a Runtime.
type Config struct {
	Name         string
	Kind         string // "agent" (default) or "proxy"
	ControlPlaneWsURL string
	VaultysID    *vaultysid.VaultysID
	Capabilities []string
	OnIntent     IntentHandler
}

// Runtime is a minimal, dependency-light agent-controller: it owns the
// WebSocket connection, the auth handshake, and the intent dispatch loop.
type Runtime struct {
	cfg Config

	mu             sync.Mutex
	conn           *websocket.Conn
	stopped        bool
	agentID        string
	authChallenger *challenger.Challenger
	authSessionID  string
	serverID       *vaultysid.VaultysID
	reconnectN     int
}

// New creates a Runtime with the given config.
func New(cfg Config) *Runtime {
	return &Runtime{cfg: cfg}
}

// Run connects and blocks, reconnecting with backoff until Stop is called.
func (r *Runtime) Run() {
	for {
		r.mu.Lock()
		stopped := r.stopped
		r.mu.Unlock()
		if stopped {
			return
		}
		r.connectOnce()
		r.scheduleReconnectDelay()
	}
}

// Stop terminates the runtime and closes the connection.
func (r *Runtime) Stop() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stopped = true
	if r.conn != nil {
		r.conn.Close()
	}
}

func (r *Runtime) scheduleReconnectDelay() {
	r.mu.Lock()
	n := r.reconnectN
	r.reconnectN++
	r.mu.Unlock()

	base := math.Min(2000*math.Pow(2, float64(n)), 60000)
	jitter := base * 0.2 * (rand.Float64()*2 - 1)
	delay := time.Duration(base+jitter) * time.Millisecond
	log.Printf("reconnecting in %.1fs (attempt %d)", delay.Seconds(), n+1)
	time.Sleep(delay)
}

func (r *Runtime) resetReconnectBackoff() {
	r.mu.Lock()
	r.reconnectN = 0
	r.mu.Unlock()
}

func (r *Runtime) connectOnce() {
	url := r.cfg.ControlPlaneWsURL
	if url == "" {
		url = "ws://localhost:8080"
	}
	log.Printf("connecting to control plane: %s", url)

	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		log.Printf("dial failed: %v", err)
		return
	}
	defer conn.Close()

	r.mu.Lock()
	r.conn = conn
	r.authChallenger = nil
	r.authSessionID = ""
	r.mu.Unlock()

	log.Printf("connected — awaiting auth challenge")

	stopHeartbeat := make(chan struct{})
	defer close(stopHeartbeat)

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			log.Printf("connection closed: %v", err)
			return
		}
		r.handleMessage(data, stopHeartbeat)
	}
}

func (r *Runtime) send(msg protocol.Message) {
	r.mu.Lock()
	conn := r.conn
	r.mu.Unlock()
	if conn == nil {
		return
	}
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("failed to marshal message: %v", err)
		return
	}
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		log.Printf("failed to send message: %v", err)
	}
}

func nowISO() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}

func (r *Runtime) handleMessage(data []byte, stopHeartbeat chan struct{}) {
	var msg protocol.Message
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("failed to parse message: %v", err)
		return
	}

	switch msg.Type {
	case "auth_challenge":
		r.handleAuthChallenge(msg, stopHeartbeat)
	case "auth_complete":
		r.handleAuthComplete(msg, stopHeartbeat)
	case "auth_failed":
		var p protocol.AuthFailedPayload
		_ = json.Unmarshal(msg.Payload, &p)
		log.Printf("auth failed: %s", p.Reason)
		r.mu.Lock()
		r.authChallenger = nil
		r.authSessionID = ""
		r.mu.Unlock()
	case "registration_pending":
		var p protocol.RegistrationPendingPayload
		_ = json.Unmarshal(msg.Payload, &p)
		log.Printf("registration pending (%s): %s", p.RegistrationID, p.Message)
	case "registration_rejected":
		log.Printf("registration rejected: %s", string(msg.Payload))
	case "intent":
		r.handleIntent(msg)
	case "pong":
		// no-op
	case "error":
		log.Printf("error from control plane: %s", string(msg.Payload))
	default:
		log.Printf("unhandled message type: %s", msg.Type)
	}
}

func (r *Runtime) handleAuthChallenge(msg protocol.Message, stopHeartbeat chan struct{}) {
	var p protocol.AuthChallengePayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		log.Printf("failed to parse auth_challenge payload: %v", err)
		return
	}

	r.mu.Lock()
	ch := r.authChallenger
	sessionID := r.authSessionID
	r.mu.Unlock()

	switch {
	case ch == nil && p.Data == "" && sessionID == "":
		// First contact: unknown to the control plane, send a register request.
		r.mu.Lock()
		r.authSessionID = p.SessionID
		r.mu.Unlock()

		payload, _ := json.Marshal(protocol.RegisterRequestPayload{
			Name:    r.cfg.Name,
			Version: "0.0.1",
			Kind:    kindOrDefault(r.cfg.Kind),
		})
		r.send(protocol.Message{
			MessageID: fmt.Sprintf("register-%d", time.Now().UnixMilli()),
			Type:      "register",
			Payload:   payload,
			Timestamp: nowISO(),
		})
		log.Printf("sent registration request")

	case ch == nil && p.Data == "" && sessionID != "":
		// Approved (or re-auth) — session id refreshed, start the Challenger handshake.
		r.mu.Lock()
		r.authSessionID = p.SessionID
		r.mu.Unlock()
		r.startAuthHandshake()

	case ch != nil:
		serverCert, err := base64.StdEncoding.DecodeString(p.Data)
		if err != nil {
			log.Printf("failed to decode auth_challenge data: %v", err)
			return
		}
		resp, err := ch.Accept(serverCert)
		if err != nil {
			log.Printf("challenger accept failed: %v", err)
			r.mu.Lock()
			r.authChallenger = nil
			r.authSessionID = ""
			r.mu.Unlock()
			return
		}
		if resp == nil {
			// Protocol complete on our side; wait for auth_complete.
			return
		}
		certBytes, err := challenger.Serialize(resp)
		if err != nil {
			log.Printf("failed to serialize challenge: %v", err)
			return
		}
		capsPayload, _ := json.Marshal(protocol.AuthChallengePayload{
			SessionID:    sessionID,
			Data:         base64.StdEncoding.EncodeToString(certBytes),
			Name:         r.cfg.Name,
			Capabilities: r.cfg.Capabilities,
		})
		r.send(protocol.Message{
			MessageID: fmt.Sprintf("auth-%d", time.Now().UnixMilli()),
			Type:      "auth_challenge",
			Payload:   capsPayload,
			Timestamp: nowISO(),
		})
	}
}

// challengerIdentity returns a copy of id pinned to protocol version 0 —
// TS's Challenger.createChallenge(protocol, service, version = 0) always
// forces `vaultysId.toVersion(version).id` on pk1 regardless of the caller's
// identity version (see @vaultys/id's Challenger.ts:327), so the wire pk1
// must be the v0 encoding even though the agent's on-disk identity is v1.
func challengerIdentity(id *vaultysid.VaultysID) *vaultysid.VaultysID {
	secret, err := id.GetSecret()
	if err != nil {
		return id
	}
	clone, err := vaultysid.FromSecret(secret)
	if err != nil {
		return id
	}
	_ = clone.ToVersion(0)
	return clone
}

func kindOrDefault(kind string) string {
	if kind == "" {
		return "agent"
	}
	return kind
}

func (r *Runtime) startAuthHandshake() {
	ch := challenger.New(challengerIdentity(r.cfg.VaultysID))
	initChallenge, err := ch.Init("p2p", "auth")
	if err != nil {
		log.Printf("failed to init challenger: %v", err)
		return
	}
	certBytes, err := challenger.Serialize(initChallenge)
	if err != nil {
		log.Printf("failed to serialize init challenge: %v", err)
		return
	}

	r.mu.Lock()
	r.authChallenger = ch
	sessionID := r.authSessionID
	r.mu.Unlock()

	payload, _ := json.Marshal(protocol.AuthChallengePayload{
		SessionID:    sessionID,
		Data:         base64.StdEncoding.EncodeToString(certBytes),
		Name:         r.cfg.Name,
		Capabilities: r.cfg.Capabilities,
	})
	r.send(protocol.Message{
		MessageID: fmt.Sprintf("auth-%d", time.Now().UnixMilli()),
		Type:      "auth_challenge",
		Payload:   payload,
		Timestamp: nowISO(),
	})
	log.Printf("sent initial auth challenge")
}

func (r *Runtime) handleAuthComplete(msg protocol.Message, stopHeartbeat chan struct{}) {
	var p protocol.AuthCompletePayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		log.Printf("failed to parse auth_complete payload: %v", err)
		return
	}

	r.mu.Lock()
	r.agentID = p.AgentID
	ch := r.authChallenger
	r.mu.Unlock()

	// Extract the server's public key (pk2 in the Challenger protocol, since
	// the agent is the initiator) to verify future signed intents.
	if ch != nil && ch.IsComplete() {
		if serverID, err := ch.GetRemoteVaultysID(); err == nil {
			r.mu.Lock()
			r.serverID = serverID
			r.mu.Unlock()
		}
	}

	r.mu.Lock()
	r.authChallenger = nil
	r.authSessionID = ""
	r.mu.Unlock()

	r.resetReconnectBackoff()
	log.Printf("auth complete — agent id: %s, did: %s", p.AgentID, p.DID)

	go r.heartbeatLoop(stopHeartbeat)
}

func (r *Runtime) heartbeatLoop(stop chan struct{}) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	start := time.Now()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			r.mu.Lock()
			agentID := r.agentID
			r.mu.Unlock()

			payload, _ := json.Marshal(protocol.HeartbeatPayload{
				Uptime: time.Since(start).Seconds(),
				Name:   r.cfg.Name,
				Memory: memStats(),
			})
			r.send(protocol.Message{
				MessageID: fmt.Sprintf("heartbeat-%d", time.Now().UnixMilli()),
				Type:      "heartbeat",
				AgentID:   agentID,
				Payload:   payload,
				Timestamp: nowISO(),
			})
		}
	}
}

func memStats() map[string]interface{} {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return map[string]interface{}{
		"rss":       m.Sys,
		"heapUsed":  m.HeapAlloc,
		"heapTotal": m.HeapSys,
	}
}

func (r *Runtime) handleIntent(msg protocol.Message) {
	var p protocol.IntentPayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		log.Printf("failed to parse intent payload: %v", err)
		return
	}

	r.mu.Lock()
	serverID := r.serverID
	agentID := r.agentID
	r.mu.Unlock()

	if serverID == nil {
		log.Printf("server public key unavailable — rejecting intent %s", msg.MessageID)
		r.sendIntentFailure(msg.MessageID, "Intent signature verification failed")
		return
	}

	if _, err := cert.VerifyIntent(serverID, msg.Signature, msg.MessageID, agentID); err != nil {
		log.Printf("intent signature verification failed for %s: %v", msg.MessageID, err)
		r.sendIntentFailure(msg.MessageID, "Intent signature verification failed")
		return
	}

	log.Printf("intent received: %s (%s)", p.Action, msg.MessageID)

	if r.cfg.OnIntent == nil {
		r.sendIntentFailure(msg.MessageID, "no intent handler configured")
		return
	}

	output, err := r.cfg.OnIntent(p.Action, p.Params, p.UserDID)
	if err != nil {
		r.sendIntentFailure(msg.MessageID, err.Error())
		return
	}

	result := protocol.ExecutionResult{
		IntentID:   msg.MessageID,
		Status:     "success",
		Output:     output,
		ExecutedAt: nowISO(),
	}
	r.sendResult(msg.MessageID, result)
	r.sendAck(msg.MessageID, true, "")
}

func (r *Runtime) sendIntentFailure(intentID, reason string) {
	result := protocol.ExecutionResult{
		IntentID:   intentID,
		Status:     "failed",
		Error:      reason,
		ExecutedAt: nowISO(),
	}
	r.sendResult(intentID, result)
	r.sendAck(intentID, false, reason)
}

func (r *Runtime) sendResult(intentID string, result protocol.ExecutionResult) {
	r.mu.Lock()
	agentID := r.agentID
	r.mu.Unlock()

	payload, _ := json.Marshal(result)
	r.send(protocol.Message{
		MessageID: fmt.Sprintf("result-%d", time.Now().UnixMilli()),
		Type:      "result",
		AgentID:   agentID,
		Payload:   payload,
		Timestamp: nowISO(),
	})
}

func (r *Runtime) sendAck(intentID string, success bool, reason string) {
	r.mu.Lock()
	agentID := r.agentID
	r.mu.Unlock()

	payload, _ := json.Marshal(protocol.AckPayload{
		MessageID: intentID,
		Success:   success,
		Reason:    reason,
	})
	r.send(protocol.Message{
		MessageID: fmt.Sprintf("ack-%d", time.Now().UnixMilli()),
		Type:      "intent_ack",
		AgentID:   agentID,
		Payload:   payload,
		Timestamp: nowISO(),
	})
}
