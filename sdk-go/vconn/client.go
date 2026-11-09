package vconn

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/VaultysClaw/sdk-go/telemetry"
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
	// Kind is the Actor kind declared in the register step — "openclaw",
	// "mcp", "sensor", "device", "proxy", or any future kind
	// (packages/controlplane/lib/actor-kinds.ts). It decides which capability
	// allow-list the control plane filters an approval against, and which
	// admin panel the Actor gets. Defaults to "openclaw", matching the control
	// plane's own default for an unset kind; the sensor sets "sensor"
	// explicitly.
	Kind string

	MaxQueueSize  int // bounded; oldest events dropped on overflow
	BatchSize     int
	BatchInterval time.Duration

	ReconnectBaseDelay time.Duration
	ReconnectMaxDelay  time.Duration

	// CapabilityStatePath persists the most recently granted capabilities (see
	// CapabilityState) so a process restart doesn't lose them. Empty disables
	// persistence entirely — capabilities then reset to ungranted on every run.
	CapabilityStatePath string
	// RequestedCapabilities is what to ask for via capability_request
	// (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b) whenever this client has none
	// granted yet, locally or from the control plane. Defaults to
	// ["process_read"], the only capability the sensor currently acts on.
	RequestedCapabilities []string

	// OnActorConfig, when set, is called with each actor_config push
	// (docs/PROXY_ARCHITECTURE.md §12). Nil ignores the message, which is the
	// right behaviour for a client that enforces nothing.
	//
	// The callback runs on the connection's read goroutine, so it must not
	// block: persist and return, and let whatever consumes the artefacts pick
	// them up on its own schedule.
	//
	// **A handler must treat the payload's two halves differently.** GrantToken
	// and RuleSetToken are signed and verifiable offline; KindConfig and Trust
	// are not authenticated at all. Acting on the unsigned half in a way that
	// could *reduce* enforcement hands anyone who can reach the socket the
	// ability to switch this host off — which is precisely the defect
	// docs/PROXY_ARCHITECTURE.md §9 records in the superseded implementation.
	OnActorConfig func(ActorConfigPayload)

	// OnGrantStatus, when set, is called with each periodic grant_status
	// re-assertion. Same goroutine rule as OnActorConfig. The token is signed;
	// verify it (sdk-go/grant.VerifyStatus) before relying on it.
	OnGrantStatus func(GrantStatusPayload)

	// OnKillSwitch, when set, is called when the control plane says a kill
	// switch covering this Actor was armed. The message is unsigned, so a
	// handler may only *suspend* in response — stop authorizing, discard held
	// grants — never grant anything. That is safe in both directions: a forged
	// kill_switch can only deny, which anyone able to inject it could already
	// do by dropping traffic, and a genuine one must take effect before the
	// socket closes rather than at the staleness bound.
	//
	// Nil still logs the event, loudly: an enforcing client that ignored a kill
	// switch is the exact gap this exists to close.
	OnKillSwitch func(KillSwitchPayload)

	// OnCapabilitiesChanged, when set, is called on capabilities_changed. Same
	// one-direction rule as OnKillSwitch: a handler may drop a grant named in a
	// certificate_revoked notice immediately, but anything that would widen
	// authority must wait for the signed actor_config that follows.
	OnCapabilitiesChanged func(CapabilitiesChangedPayload)

	Logger *slog.Logger
}

func (c *ClientConfig) setDefaults() {
	if c.Name == "" {
		// Neutral default now that this is a general-purpose SDK rather than
		// the sensor's own package — an Actor that doesn't name itself shows
		// up in the admin console as this, not as a sensor it isn't.
		c.Name = "vaultysclaw-actor"
	}
	if c.Version == "" {
		c.Version = "0.1.0"
	}
	if c.Kind == "" {
		c.Kind = "openclaw"
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
	// Deliberately no default: an SDK that silently asks for a capability the
	// caller never named would be requesting authority on their behalf. An
	// empty list means "ask for nothing" — a valid state, and what a
	// telemetry-only Actor approved with zero capabilities actually holds.
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

	// capMu/capabilities track what the control plane has actually granted via a completed
	// service:"certificate" exchange (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b). Loaded from
	// cfg.CapabilityStatePath at construction and re-persisted on every cert_issued, so it
	// survives both reconnects and process restarts (see HasCapability) — it's a durable,
	// independently verifiable certificate, not a session-bound grant, so there's no need to
	// forget it just because the connection dropped.
	capMu        sync.Mutex
	capabilities map[string]bool
	// suspended is set by a kill_switch and cleared on the next auth_complete.
	suspended bool

	// writeMu serializes writes to the active connection: sendLoop's ticker-driven telemetry
	// flushes and its background reader's cert-round replies both write to the same *websocket.Conn,
	// and gorilla/websocket allows at most one concurrent writer.
	writeMu sync.Mutex
}

func NewClientConn(cfg ClientConfig) *ClientConn {
	cfg.setDefaults()
	c := &ClientConn{cfg: cfg}
	state, err := loadCapabilityState(cfg.CapabilityStatePath)
	if err != nil {
		cfg.Logger.Warn("vconn: failed to load persisted capability state — starting ungranted", "error", err)
	} else if state != nil {
		c.setCapabilities(state.Capabilities)
		cfg.Logger.Info("vconn: restored persisted capabilities", "capabilities", state.Capabilities)
	}
	return c
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

// HasCapability reports whether the control plane has actually delivered the named capability
// via a completed certificate exchange on the current connection — e.g. cmd/sensor/poll.go gates
// reading local process info on HasCapability("process_read") rather than collecting anything
// before being granted it.
func (c *ClientConn) HasCapability(name string) bool {
	c.capMu.Lock()
	defer c.capMu.Unlock()
	return c.capabilities[name]
}

// suspend drops the in-memory capability set on a kill switch, remembering
// that it did so. The persisted state is left alone — the switch is
// reversible, and resumeAfterSuspension restores from it.
func (c *ClientConn) suspend() {
	c.capMu.Lock()
	defer c.capMu.Unlock()
	c.capabilities = map[string]bool{}
	c.suspended = true
}

// resumeAfterSuspension restores the persisted capability set after a kill
// switch was disarmed. A no-op unless suspend ran.
func (c *ClientConn) resumeAfterSuspension() {
	c.capMu.Lock()
	wasSuspended := c.suspended
	c.suspended = false
	c.capMu.Unlock()
	if !wasSuspended {
		return
	}
	state, err := loadCapabilityState(c.cfg.CapabilityStatePath)
	if err != nil || state == nil {
		return
	}
	c.setCapabilities(state.Capabilities)
	c.cfg.Logger.Info("vconn: kill switch lifted — restored persisted capabilities", "capabilities", state.Capabilities)
}

func (c *ClientConn) setCapabilities(names []string) {
	c.capMu.Lock()
	defer c.capMu.Unlock()
	c.capabilities = make(map[string]bool, len(names))
	for _, n := range names {
		c.capabilities[n] = true
	}
}

// hasAnyCapability reports whether anything at all has been granted yet —
// used to decide whether to proactively ask the control plane for
// RequestedCapabilities rather than silently waiting on an admin.
func (c *ClientConn) hasAnyCapability() bool {
	c.capMu.Lock()
	defer c.capMu.Unlock()
	return len(c.capabilities) > 0
}

func (c *ClientConn) writeJSON(conn *websocket.Conn, v any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return conn.WriteJSON(v)
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

	// Declare ourselves first and wait for the server's reply — this is
	// packages/controlplane's actual protocol (lib/ws-server.ts's
	// handleConnection sends nothing at all until it receives "register";
	// handleRegister is what replies with the session id). Earlier this
	// unconditionally read an unsolicited "hello" before sending register,
	// which only the now-superseded standalone reference collector
	// (internal/vconn/server.go) ever sent — against the real control
	// plane that first read simply hung forever, since nothing arrives
	// until the server has something to react to.
	regEnv, err := NewEnvelope(MsgRegister, RegisterPayload{Name: c.cfg.Name, Version: c.cfg.Version, Kind: c.cfg.Kind})
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
	var ackPayload AuthChallengePayload
	if err := regAck.Decode(&ackPayload); err != nil {
		return false, fmt.Errorf("decoding register ack: %w", err)
	}
	sessionID := ackPayload.SessionID

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

	// Ask for RequestedCapabilities the moment there's an authenticated channel to ask over —
	// as soon as registration is merely pending (so an admin sees what's wanted while deciding)
	// if nothing's granted yet, or right after auth_complete for a known Actor that still has
	// none. Sent at most once per connection attempt; a no-op once something's already granted,
	// whether restored from disk or from an earlier round on this same connection.
	requestedCaps := false
	sendCapabilityRequest := func() {
		if requestedCaps || c.hasAnyCapability() {
			return
		}
		requestedCaps = true
		req, err := NewEnvelope(MsgCapabilityRequest, CapabilityRequestPayload{RequestedCapabilities: c.cfg.RequestedCapabilities})
		if err != nil {
			c.cfg.Logger.Warn("vconn: encoding capability_request failed", "error", err)
			return
		}
		if err := conn.WriteJSON(req); err != nil {
			c.cfg.Logger.Warn("vconn: sending capability_request failed", "error", err)
			return
		}
		c.cfg.Logger.Info("vconn: requested capabilities — none granted yet", "requested", c.cfg.RequestedCapabilities)
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
			sendCapabilityRequest()
		case MsgRegistrationPending:
			var payload RegistrationPendingPayload
			_ = env.Decode(&payload)
			c.cfg.Logger.Info("vconn: awaiting operator approval", "registrationId", payload.RegistrationID, "message", payload.Message)
			// same as MsgPendingApproval, above — the real control plane's
			// naming for the same "handshake ok, awaiting admin" state.
			sendCapabilityRequest()
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
			// The control plane refuses the handshake while a kill switch
			// covers this Actor, so reaching auth_complete means any switch
			// that suspended it has been disarmed.
			c.resumeAfterSuspension()
			// A known Actor reconnecting lands here directly, skipping the pending-approval
			// cases above entirely — if it still has nothing granted (e.g. its very first
			// registration was approved with no capabilities), ask now rather than staying
			// silent forever.
			sendCapabilityRequest()
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
// detects disconnection via a background reader (gorilla/websocket supports
// one concurrent reader alongside this loop's writes — both the reader's
// cert-round replies and the ticker's telemetry flushes go through
// writeJSON, which serializes them against each other).
func (c *ClientConn) sendLoop(ctx context.Context, conn *websocket.Conn) error {
	readErrCh := make(chan error, 1)
	go func() {
		// certHS is only ever touched from this single goroutine — no lock needed.
		var certHS *CertHandshake
		for {
			var env Envelope
			if err := conn.ReadJSON(&env); err != nil {
				readErrCh <- err
				return
			}
			switch env.Type {
			case MsgCertChallenge:
				certHS = c.handleCertChallenge(conn, env, certHS)
			case MsgCertIssued:
				var payload CertIssuedPayload
				_ = env.Decode(&payload)
				c.setCapabilities(payload.Capabilities)
				if err := saveCapabilityState(c.cfg.CapabilityStatePath, CapabilityState{
					CertID:       payload.CertID,
					Certificate:  payload.Certificate,
					Capabilities: payload.Capabilities,
				}); err != nil {
					c.cfg.Logger.Warn("vconn: failed to persist capability state", "error", err)
				}
				c.cfg.Logger.Info("vconn: certificate delivered", "certId", payload.CertID, "capabilities", payload.Capabilities)
				certHS = nil
			case MsgActorConfig:
				var payload ActorConfigPayload
				if err := env.Decode(&payload); err != nil {
					// A push that cannot be decoded must not partially apply:
					// half a policy is a policy nobody authored.
					c.cfg.Logger.Warn("vconn: actor_config could not be decoded; keeping the current configuration", "error", err)
					break
				}
				if c.cfg.OnActorConfig != nil {
					c.cfg.OnActorConfig(payload)
				}
			case MsgGrantStatus:
				var payload GrantStatusPayload
				if err := env.Decode(&payload); err != nil || payload.GrantStatusToken == "" {
					c.cfg.Logger.Warn("vconn: grant_status could not be decoded; the held status keeps ageing toward its bound", "error", err)
					break
				}
				if c.cfg.OnGrantStatus != nil {
					c.cfg.OnGrantStatus(payload)
				}
			case MsgKillSwitch:
				var payload KillSwitchPayload
				_ = env.Decode(&payload)
				c.cfg.Logger.Warn("vconn: KILL SWITCH armed by the control plane — suspending",
					"scope", payload.Scope, "workspaceId", payload.WorkspaceID, "reason", payload.Reason, "armedAt", payload.ArmedAt)
				// Whatever capability list this client was gating on is no
				// longer authorized; drop it in memory before anything else.
				// Not persisted: the switch is reversible, and the next
				// cert_issued or status refresh re-establishes it.
				c.suspend()
				if c.cfg.OnKillSwitch != nil {
					c.cfg.OnKillSwitch(payload)
				}
			case MsgCapabilitiesChanged:
				var payload CapabilitiesChangedPayload
				_ = env.Decode(&payload)
				c.cfg.Logger.Info("vconn: capabilities changed", "reason", payload.Reason, "certIds", payload.CertIDs)
				if c.cfg.OnCapabilitiesChanged != nil {
					c.cfg.OnCapabilitiesChanged(payload)
				}
			case MsgCertFailed:
				var payload CertFailedPayload
				_ = env.Decode(&payload)
				c.cfg.Logger.Warn("vconn: certificate exchange failed", "reason", payload.Reason)
				certHS = nil
			default:
				// Nothing else expected from the control plane post-connect; ignored.
			}
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

// handleCertChallenge advances (or starts) the certificate sub-protocol by one round, replying
// on the same connection. Returns the handshake to carry into the next round (nil once the
// exchange has failed and should be abandoned).
func (c *ClientConn) handleCertChallenge(conn *websocket.Conn, env Envelope, certHS *CertHandshake) *CertHandshake {
	var payload CertChallengePayload
	if err := env.Decode(&payload); err != nil {
		c.cfg.Logger.Warn("vconn: malformed cert_challenge", "error", err)
		return certHS
	}

	var nextB64 string
	var err error
	if certHS == nil {
		certHS = NewCertHandshake(c.cfg.Identity.VaultysID())
		nextB64, err = certHS.Start()
	} else {
		nextB64, err = certHS.Accept(payload.Data)
	}
	if err != nil {
		c.cfg.Logger.Warn("vconn: certificate handshake failed", "error", err)
		return nil
	}
	if nextB64 == "" {
		return certHS
	}

	resp, err := NewEnvelope(MsgCertChallenge, CertChallengePayload{SessionID: payload.SessionID, Data: nextB64})
	if err != nil {
		c.cfg.Logger.Warn("vconn: encoding cert_challenge response failed", "error", err)
		return certHS
	}
	if err := c.writeJSON(conn, resp); err != nil {
		c.cfg.Logger.Warn("vconn: sending cert_challenge response failed", "error", err)
	}
	return certHS
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
		if err := c.writeJSON(conn, env); err != nil {
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
