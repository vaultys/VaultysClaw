package vconn

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/VaultysClaw/sdk-go/telemetry"
	sdkvconn "github.com/vaultys/VaultysClaw/sdk-go/vconn"
	"github.com/vaultys/vaultysclaw-sensor/internal/ingest"
)

// pendingApprovalTimeout bounds how long a held connection waits for an
// operator decision before it's dropped — mirrors the real control
// plane's registration-approval timeout, and keeps a vanished client from
// leaving a pending entry around forever.
const pendingApprovalTimeout = 10 * time.Minute

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// Not a browser-facing API — no cross-origin credential risk to gate
	// on Origin here the way a same-site cookie-authenticated endpoint
	// would need to.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ErrUnknownPendingDID is returned by Approve/Reject when no connection is
// currently held pending for the given DID (already decided, or the
// client disconnected).
var ErrUnknownPendingDID = errors.New("vconn: no pending connection for that DID")

// Server manages the collector side of VaultysId-authenticated
// connections: per-connection handshake, DID known/unknown decision, a
// pending-approval registry, and telemetry receipt into an ingest.Store.
// Implements ingest.PendingLister and ingest.Approver structurally.
type Server struct {
	store    *ingest.Store
	identity *identity.Provider
	logger   *slog.Logger

	mu      sync.Mutex
	pending map[string]*session // keyed by DID
}

func NewServer(store *ingest.Store, id *identity.Provider, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{store: store, identity: id, logger: logger, pending: make(map[string]*session)}
}

// session is one held connection awaiting (or just past) an approval
// decision.
type session struct {
	conn      *websocket.Conn
	did       string
	firstSeen time.Time
	decision  chan decision // buffered 1
}

type decision struct {
	approved bool
	reason   string
}

// HandleWS upgrades an HTTP request to a WebSocket and runs the
// connection's full lifecycle: handshake, known/pending decision,
// telemetry receipt. Matches http.HandlerFunc.
func (s *Server) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.logger.Warn("vconn: websocket upgrade failed", "error", err)
		return
	}
	defer conn.Close()

	if err := s.run(conn); err != nil {
		s.logger.Info("vconn: connection ended", "error", err)
	}
}

func (s *Server) run(conn *websocket.Conn) error {
	sessionID := sdkvconn.NewMessageID()
	hs := sdkvconn.NewHandshake(s.identity.VaultysID())

	// No proactive greeting: packages/controlplane's real ws-server.ts sends
	// nothing at all until it receives "register" (handleConnection just
	// registers message listeners; handleRegister is what replies with the
	// session id) — a client waiting for an unsolicited first message would
	// hang forever against it. This used to write an empty auth_challenge
	// here before reading anything, which raced against the register-ack
	// this same session id is also carried on below: whichever arrived
	// first at the client was harmless on its own (same session id either
	// way), but the *other* one was then left unread in the socket and
	// corrupted the very next handshake round. One message, sent only once
	// the client has actually said something, matches the real server and
	// removes the race entirely.
	first, err := s.readFirstHandshakeMessage(conn, sessionID)
	if err != nil {
		return err
	}

	if err := s.driveHandshake(conn, sessionID, hs, first); err != nil {
		return err
	}

	did, err := hs.RemoteDID()
	if err != nil {
		return err
	}

	if !s.store.HasDevice(did) {
		if err := s.awaitApproval(conn, did); err != nil {
			return err
		}
		s.store.EnsureDevice(did, time.Now())
	}

	completeEnv, err := sdkvconn.NewEnvelope(sdkvconn.MsgAuthComplete, sdkvconn.AuthCompletePayload{DID: did})
	if err != nil {
		return err
	}
	if err := conn.WriteJSON(completeEnv); err != nil {
		return fmt.Errorf("sending auth_complete: %w", err)
	}
	s.logger.Info("vconn: device connected", "did", did)

	return s.receiveTelemetry(conn, did)
}

// readFirstHandshakeMessage reads the client's opening message, which must
// be "register" — matching the real control plane's protocol
// (packages/controlplane/lib/ws-server.ts's handleRegister: nothing is
// sent, and no other message type is accepted, until register arrives).
// Acknowledges it with the session id and returns the *next* message as
// the first handshake envelope.
func (s *Server) readFirstHandshakeMessage(conn *websocket.Conn, sessionID string) (sdkvconn.Envelope, error) {
	var env sdkvconn.Envelope
	if err := conn.ReadJSON(&env); err != nil {
		return sdkvconn.Envelope{}, fmt.Errorf("reading first message: %w", err)
	}
	if env.Type != sdkvconn.MsgRegister {
		return sdkvconn.Envelope{}, fmt.Errorf("expected register as the first message, got %q", env.Type)
	}

	var payload sdkvconn.RegisterPayload
	_ = env.Decode(&payload)
	s.logger.Info("vconn: client registering", "name", payload.Name, "kind", payload.Kind)

	ack, err := sdkvconn.NewEnvelope(sdkvconn.MsgAuthChallenge, sdkvconn.AuthChallengePayload{SessionID: sessionID, Data: ""})
	if err != nil {
		return sdkvconn.Envelope{}, err
	}
	if err := conn.WriteJSON(ack); err != nil {
		return sdkvconn.Envelope{}, fmt.Errorf("sending register ack: %w", err)
	}

	if err := conn.ReadJSON(&env); err != nil {
		return sdkvconn.Envelope{}, fmt.Errorf("reading message after register ack: %w", err)
	}
	return env, nil
}

// driveHandshake exchanges auth_challenge messages until the local side of
// the handshake completes (the peer completes on its own next Accept,
// server-side that's exactly the message that got us here). first is the
// already-read message that follows the (optional) register step.
func (s *Server) driveHandshake(conn *websocket.Conn, sessionID string, hs *sdkvconn.Handshake, first sdkvconn.Envelope) error {
	env := first
	for !hs.IsComplete() {
		if env.Type != sdkvconn.MsgAuthChallenge {
			return fmt.Errorf("unexpected message type %q during handshake", env.Type)
		}
		var payload sdkvconn.AuthChallengePayload
		if err := env.Decode(&payload); err != nil {
			return fmt.Errorf("decoding handshake payload: %w", err)
		}

		nextB64, err := hs.Accept(payload.Data)
		if err != nil {
			failEnv, encErr := sdkvconn.NewEnvelope(sdkvconn.MsgAuthFailed, sdkvconn.AuthFailedPayload{Reason: err.Error()})
			if encErr == nil {
				_ = conn.WriteJSON(failEnv)
			}
			return fmt.Errorf("handshake failed: %w", err)
		}
		if nextB64 != "" {
			resp, err := sdkvconn.NewEnvelope(sdkvconn.MsgAuthChallenge, sdkvconn.AuthChallengePayload{SessionID: sessionID, Data: nextB64})
			if err != nil {
				return err
			}
			if err := conn.WriteJSON(resp); err != nil {
				return fmt.Errorf("sending handshake response: %w", err)
			}
		}

		if hs.IsComplete() {
			break
		}
		if err := conn.ReadJSON(&env); err != nil {
			return fmt.Errorf("reading handshake message: %w", err)
		}
	}
	return nil
}

// awaitApproval registers the connection as pending, notifies the client,
// and blocks until an operator approves/rejects it (via Approve/Reject)
// or the approval timeout elapses.
func (s *Server) awaitApproval(conn *websocket.Conn, did string) error {
	sess := &session{conn: conn, did: did, firstSeen: time.Now(), decision: make(chan decision, 1)}

	s.mu.Lock()
	s.pending[did] = sess
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.pending, did)
		s.mu.Unlock()
	}()

	pendingEnv, err := sdkvconn.NewEnvelope(sdkvconn.MsgPendingApproval, sdkvconn.PendingApprovalPayload{DID: did})
	if err != nil {
		return err
	}
	if err := conn.WriteJSON(pendingEnv); err != nil {
		return fmt.Errorf("sending pending_approval: %w", err)
	}
	s.logger.Info("vconn: connection pending approval", "did", did)

	select {
	case d := <-sess.decision:
		if !d.approved {
			failEnv, encErr := sdkvconn.NewEnvelope(sdkvconn.MsgAuthFailed, sdkvconn.AuthFailedPayload{Reason: d.reason})
			if encErr == nil {
				_ = conn.WriteJSON(failEnv)
			}
			return fmt.Errorf("rejected: %s", d.reason)
		}
		return nil
	case <-time.After(pendingApprovalTimeout):
		failEnv, encErr := sdkvconn.NewEnvelope(sdkvconn.MsgAuthFailed, sdkvconn.AuthFailedPayload{Reason: "approval timeout"})
		if encErr == nil {
			_ = conn.WriteJSON(failEnv)
		}
		return fmt.Errorf("approval timed out for %s", did)
	}
}

// receiveTelemetry reads sensor_telemetry batches until the connection
// closes, feeding events straight into the ingest.Store.
func (s *Server) receiveTelemetry(conn *websocket.Conn, did string) error {
	for {
		var env sdkvconn.Envelope
		if err := conn.ReadJSON(&env); err != nil {
			return fmt.Errorf("connection closed: %w", err)
		}
		switch env.Type {
		case sdkvconn.MsgSensorTelemetry:
			var payload sdkvconn.SensorTelemetryPayload
			if err := env.Decode(&payload); err != nil {
				s.logger.Warn("vconn: malformed telemetry payload", "did", did, "error", err)
				continue
			}
			now := time.Now()
			accepted := 0
			for _, evt := range payload.Events {
				if evt.SchemaVersion != telemetry.SchemaVersion {
					s.logger.Warn("vconn: skipping event with unsupported schema version", "version", evt.SchemaVersion)
					continue
				}
				s.store.UpsertDevice(evt.Device, now)
				s.store.UpsertWorkload(did, evt, now)
				accepted++
			}
			s.logger.Info("vconn: telemetry accepted", "did", did, "events", accepted)
		case sdkvconn.MsgHeartbeat:
			// keepalive only
		default:
			s.logger.Warn("vconn: unexpected message type after connect", "did", did, "type", env.Type)
		}
	}
}

// ListPending implements ingest.PendingLister.
func (s *Server) ListPending() []ingest.PendingInfo {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]ingest.PendingInfo, 0, len(s.pending))
	for did, sess := range s.pending {
		out = append(out, ingest.PendingInfo{DID: did, FirstSeen: sess.firstSeen})
	}
	return out
}

// Approve implements ingest.Approver.
func (s *Server) Approve(did string) error {
	return s.decide(did, decision{approved: true})
}

// Reject implements ingest.Approver.
func (s *Server) Reject(did string, reason string) error {
	return s.decide(did, decision{approved: false, reason: reason})
}

func (s *Server) decide(did string, d decision) error {
	s.mu.Lock()
	sess, ok := s.pending[did]
	s.mu.Unlock()
	if !ok {
		return ErrUnknownPendingDID
	}
	select {
	case sess.decision <- d:
		return nil
	default:
		return fmt.Errorf("vconn: a decision was already made for %s", did)
	}
}
