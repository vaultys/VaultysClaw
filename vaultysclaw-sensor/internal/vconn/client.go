package vconn

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/vaultys/vaultysclaw-sensor/internal/identity"
	"github.com/vaultys/vaultysclaw-sensor/internal/telemetry"
)

// ClientConfig configures the sensor-side connection.
type ClientConfig struct {
	CollectorURL string // e.g. "http://host:port" — ws(s):// is derived automatically
	Identity     *identity.Provider

	// Name and Version are sent in the register step (see MsgRegister) —
	// Name is typically the device's hostname or a configured name, shown
	// by both the standalone collector and the real control plane's
	// admin UI.
	Name    string
	Version string

	MaxQueueSize  int // bounded; oldest events dropped on overflow
	BatchSize     int
	BatchInterval time.Duration

	ReconnectBaseDelay time.Duration
	ReconnectMaxDelay  time.Duration

	Logger *slog.Logger
}

func (c *ClientConfig) setDefaults() {
	if c.Name == "" {
		c.Name = "vaultysclaw-sensor"
	}
	if c.Version == "" {
		c.Version = "0.1.0"
	}
	if c.MaxQueueSize <= 0 {
		c.MaxQueueSize = 1000
	}
	if c.BatchSize <= 0 {
		c.BatchSize = 50
	}
	if c.BatchInterval <= 0 {
		c.BatchInterval = 10 * time.Second
	}
	if c.ReconnectBaseDelay <= 0 {
		c.ReconnectBaseDelay = time.Second
	}
	if c.ReconnectMaxDelay <= 0 {
		c.ReconnectMaxDelay = 30 * time.Second
	}
	if c.Logger == nil {
		c.Logger = slog.Default()
	}
}

// ClientConn manages the sensor's connection to the collector: dial, run
// the real VaultysId handshake, wait out pending approval if needed, send
// telemetry once connected, and reconnect with capped backoff on any
// disconnect. A connection failure never crashes the sensor — the local
// queue stays bounded even if the collector is unreachable indefinitely.
type ClientConn struct {
	cfg   ClientConfig
	mu    sync.Mutex
	queue []telemetry.Event
}

func NewClientConn(cfg ClientConfig) *ClientConn {
	cfg.setDefaults()
	return &ClientConn{cfg: cfg}
}

// Enqueue adds an event to the bounded local queue, dropping the oldest
// queued event if already full.
func (c *ClientConn) Enqueue(evt telemetry.Event) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.queue) >= c.cfg.MaxQueueSize {
		c.queue = c.queue[1:]
	}
	c.queue = append(c.queue, evt)
}

// QueueLen reports the number of events currently queued (test/debug aid).
func (c *ClientConn) QueueLen() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.queue)
}

func (c *ClientConn) drain(max int) []telemetry.Event {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.queue) == 0 {
		return nil
	}
	n := max
	if n <= 0 || n > len(c.queue) {
		n = len(c.queue)
	}
	batch := make([]telemetry.Event, n)
	copy(batch, c.queue[:n])
	c.queue = c.queue[n:]
	return batch
}

// Run connects (and reconnects with capped exponential backoff on any
// failure or disconnect) until ctx is cancelled.
func (c *ClientConn) Run(ctx context.Context) {
	backoff := c.cfg.ReconnectBaseDelay
	for ctx.Err() == nil {
		everConnected, err := c.connectAndServe(ctx)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			c.cfg.Logger.Warn("vconn: connection attempt ended", "error", err)
		}
		if everConnected {
			backoff = c.cfg.ReconnectBaseDelay
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}

		if !everConnected {
			backoff *= 2
			if backoff > c.cfg.ReconnectMaxDelay {
				backoff = c.cfg.ReconnectMaxDelay
			}
		}
	}
}

// connectAndServe dials, runs the handshake (including waiting out
// pending approval if needed), and then sends telemetry until the
// connection drops or ctx is cancelled. everConnected reports whether
// auth_complete was ever reached, so the caller can decide whether to
// reset its backoff.
func (c *ClientConn) connectAndServe(ctx context.Context) (everConnected bool, err error) {
	wsURL, err := toWebSocketURL(c.cfg.CollectorURL)
	if err != nil {
		return false, err
	}

	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	conn, _, err := dialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return false, fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	var hello Envelope
	if err := conn.ReadJSON(&hello); err != nil {
		return false, fmt.Errorf("reading hello: %w", err)
	}
	var helloPayload AuthChallengePayload
	if err := hello.Decode(&helloPayload); err != nil {
		return false, fmt.Errorf("decoding hello: %w", err)
	}
	sessionID := helloPayload.SessionID

	// Declare ourselves before the real handshake starts — required by the
	// real control plane (packages/control-plane/lib/ws-server.ts
	// handleRegisterRequest expects a leading "register" message while the
	// connection is in its "awaiting_register" phase); the standalone
	// collector (internal/vconn/server.go) tolerates and acknowledges it
	// too, so this works unmodified against either target.
	regEnv, err := NewEnvelope(MsgRegister, RegisterPayload{Name: c.cfg.Name, Version: c.cfg.Version, Kind: "sensor"})
	if err != nil {
		return false, err
	}
	if err := conn.WriteJSON(regEnv); err != nil {
		return false, fmt.Errorf("sending register: %w", err)
	}
	var regAck Envelope
	if err := conn.ReadJSON(&regAck); err != nil {
		return false, fmt.Errorf("reading register ack: %w", err)
	}
	if regAck.Type != MsgAuthChallenge {
		return false, fmt.Errorf("unexpected message type %q after register", regAck.Type)
	}

	hs := NewHandshake(c.cfg.Identity.VaultysID())
	initB64, err := hs.Start()
	if err != nil {
		return false, err
	}
	initEnv, err := NewEnvelope(MsgAuthChallenge, AuthChallengePayload{SessionID: sessionID, Data: initB64})
	if err != nil {
		return false, err
	}
	if err := conn.WriteJSON(initEnv); err != nil {
		return false, fmt.Errorf("sending init: %w", err)
	}

handshakeLoop:
	for {
		var env Envelope
		if err := conn.ReadJSON(&env); err != nil {
			return false, fmt.Errorf("reading message: %w", err)
		}
		switch env.Type {
		case MsgAuthChallenge:
			var payload AuthChallengePayload
			if err := env.Decode(&payload); err != nil {
				return false, fmt.Errorf("decoding handshake payload: %w", err)
			}
			nextB64, err := hs.Accept(payload.Data)
			if err != nil {
				return false, fmt.Errorf("handshake failed: %w", err)
			}
			if nextB64 != "" {
				resp, err := NewEnvelope(MsgAuthChallenge, AuthChallengePayload{SessionID: sessionID, Data: nextB64})
				if err != nil {
					return false, err
				}
				if err := conn.WriteJSON(resp); err != nil {
					return false, fmt.Errorf("sending handshake response: %w", err)
				}
			}
		case MsgPendingApproval:
			var payload PendingApprovalPayload
			_ = env.Decode(&payload)
			c.cfg.Logger.Info("vconn: awaiting operator approval", "did", payload.DID)
			// keep waiting — the collector holds this connection open and
			// will send auth_complete or auth_failed once decided.
		case MsgRegistrationPending:
			var payload RegistrationPendingPayload
			_ = env.Decode(&payload)
			c.cfg.Logger.Info("vconn: awaiting operator approval", "registrationId", payload.RegistrationID, "message", payload.Message)
			// same as MsgPendingApproval, above — the real control plane's
			// naming for the same "handshake ok, awaiting admin" state.
		case MsgRegistrationApproved:
			var payload RegistrationApprovedPayload
			_ = env.Decode(&payload)
			c.cfg.Logger.Info("vconn: registration approved", "registrationId", payload.RegistrationID)
			// informational only — auth_complete (next message) is what
			// actually ends the handshake loop.
		case MsgAuthComplete:
			var payload AuthCompletePayload
			_ = env.Decode(&payload)
			c.cfg.Logger.Info("vconn: connected", "did", payload.DID)
			break handshakeLoop
		case MsgAuthFailed:
			var payload AuthFailedPayload
			_ = env.Decode(&payload)
			return false, fmt.Errorf("connection refused: %s", payload.Reason)
		default:
			return false, fmt.Errorf("unexpected message type %q", env.Type)
		}
	}

	return true, c.sendLoop(ctx, conn)
}

// sendLoop batches and sends queued telemetry on cfg.BatchInterval, and
// detects disconnection via a background reader (gorilla/websocket
// supports one concurrent reader alongside this loop's writes).
func (c *ClientConn) sendLoop(ctx context.Context, conn *websocket.Conn) error {
	readErrCh := make(chan error, 1)
	go func() {
		for {
			var env Envelope
			if err := conn.ReadJSON(&env); err != nil {
				readErrCh <- err
				return
			}
			// Nothing else expected from the collector post-connect in
			// this MVP; unknown messages are simply ignored.
		}
	}()

	ticker := time.NewTicker(c.cfg.BatchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case err := <-readErrCh:
			return fmt.Errorf("connection closed: %w", err)
		case <-ticker.C:
			if err := c.flushOnce(conn); err != nil {
				return err
			}
		}
	}
}

func (c *ClientConn) flushOnce(conn *websocket.Conn) error {
	for {
		batch := c.drain(c.cfg.BatchSize)
		if len(batch) == 0 {
			return nil
		}
		env, err := NewEnvelope(MsgSensorTelemetry, SensorTelemetryPayload{Events: batch})
		if err != nil {
			return err
		}
		env.AgentID = c.cfg.Identity.VaultysID().DID()
		if err := conn.WriteJSON(env); err != nil {
			return fmt.Errorf("sending telemetry: %w", err)
		}
		if len(batch) < c.cfg.BatchSize {
			return nil
		}
	}
}

// toWebSocketURL derives a ws(s):// URL (at path /ws) from an http(s)://
// collector URL, passing ws(s):// URLs through unchanged.
func toWebSocketURL(collectorURL string) (string, error) {
	u, err := url.Parse(collectorURL)
	if err != nil {
		return "", fmt.Errorf("vconn: parsing collector URL: %w", err)
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	case "ws", "wss":
		// already correct
	default:
		return "", fmt.Errorf("vconn: unsupported collector URL scheme %q", u.Scheme)
	}
	u.Path = "/ws"
	return u.String(), nil
}
