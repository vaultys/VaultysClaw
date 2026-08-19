// Package vconn implements a VaultysId-authenticated WebSocket connection
// between the sensor (client role) and the reference collector (server
// role) — a register → challenge → admin-approval → connected lifecycle
// matching how real VaultysClaw agents connect, driven by the real
// challenger handshake (github.com/vaultys/vaultysid/go/pkg/challenger)
// rather than a bespoke auth scheme. Message naming mirrors
// packages/control-plane's WS protocol (auth_challenge/auth_complete/
// auth_failed) for conceptual continuity with the real system — see
// docs/vaultysclaw-integration.md.
package vconn

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/telemetry"
)

// MessageType identifies the kind of message carried in an Envelope.
type MessageType string

const (
	// MsgRegister is sent by the client immediately after the server's
	// hello, declaring what it is before the real VaultysId handshake
	// starts. This matches the real control plane's protocol exactly
	// (packages/control-plane/lib/ws-server.ts handleRegisterRequest,
	// packages/shared/src/types.ts WSRegisterRequestPayload) so the same
	// sensor binary can register directly against it, not just the
	// standalone reference collector.
	MsgRegister MessageType = "register"
	// MsgAuthChallenge carries one step of the challenge/response
	// handshake (AuthChallengePayload). Sent by both sides.
	MsgAuthChallenge MessageType = "auth_challenge"
	// MsgAuthComplete is sent by the server once the handshake succeeds
	// and the device is connected (known DID, or just approved).
	MsgAuthComplete MessageType = "auth_complete"
	// MsgAuthFailed is sent by the server on handshake failure or
	// rejection.
	MsgAuthFailed MessageType = "auth_failed"
	// MsgPendingApproval is sent by the standalone reference collector
	// (internal/vconn/server.go) when the handshake succeeded but the DID
	// is unknown — an operator must approve it via the collector's REST
	// API before telemetry is accepted.
	MsgPendingApproval MessageType = "pending_approval"
	// MsgRegistrationPending is the real control plane's equivalent of
	// MsgPendingApproval (packages/shared/src/types.ts) — sent instead of
	// it when the sensor connects directly to packages/control-plane.
	MsgRegistrationPending MessageType = "registration_pending"
	// MsgRegistrationApproved is sent by the real control plane right
	// before auth_complete, the first time an admin approves a previously
	// unknown sensor DID while its connection is still held open
	// (packages/control-plane/lib/ws-server.ts approveSensorRegistration).
	// Purely informational here — auth_complete is what actually unblocks
	// the handshake loop — but it must be recognized and not treated as a
	// protocol error, or this first post-approval connection drops and has
	// to fall back to a reconnect (which then succeeds via the known-DID
	// fast path, since the approval already landed).
	MsgRegistrationApproved MessageType = "registration_approved"
	// MsgSensorTelemetry carries a batch of telemetry events. Sent by the
	// client only after MsgAuthComplete.
	MsgSensorTelemetry MessageType = "sensor_telemetry"
	// MsgHeartbeat is a keepalive, sent by either side.
	MsgHeartbeat MessageType = "heartbeat"
	// MsgCertChallenge carries one step of a *second*, independent Challenger
	// exchange (protocol/service "p2p"/"certificate", not "p2p"/"auth") that
	// the control plane proactively starts over the already-authenticated
	// connection once an admin approves a capability grant
	// (packages/controlplane/lib/ws-server.ts's deliverApprovedCapabilities,
	// docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b). Same envelope shape as
	// MsgAuthChallenge, different sub-protocol — see internal/vconn/cert_handshake.go.
	MsgCertChallenge MessageType = "cert_challenge"
	// MsgCertIssued confirms the certificate round completed and identifies
	// the resulting certificate; CertHandshake.CapabilitiesJSON() is what the
	// control plane actually granted (surfaced during the round, at STEP1 —
	// this message just marks "the exchange is done, use what you already saw").
	MsgCertIssued MessageType = "cert_issued"
	// MsgCertFailed explains why the certificate round didn't complete.
	MsgCertFailed MessageType = "cert_failed"
	// MsgCapabilityRequest is a plain, unsigned request the client sends over its already-
	// authenticated connection to ask for capabilities — either while still waiting out
	// registration approval, or later as a known, connected Actor with none yet (docs/
	// CERTIFICATE_WEB_OF_TRUST.md §3.2b step 1). The control plane already handles this for
	// every agent kind (packages/controlplane/lib/ws-server.ts handleCapabilityRequest); the
	// sensor just never sent one before, relying entirely on an admin proactively granting it.
	MsgCapabilityRequest MessageType = "capability_request"
)

// Envelope is the JSON message wrapper exchanged over the WebSocket
// connection. The handshake payloads (AuthChallengePayload.Data) are
// themselves base64(msgpack(...)) — see internal/vconn/handshake.go.
type Envelope struct {
	MessageID string      `json:"messageId"`
	Type      MessageType `json:"type"`
	// AgentID identifies the sender on authenticated messages sent after
	// auth_complete — the real control plane's handleSensorTelemetry
	// (packages/control-plane/lib/ws-server.ts) looks up the connected
	// sensor by this top-level field (message.agentId) and silently drops
	// the message if it's empty, so sensor_telemetry must always set it to
	// our own DID. Unused (and omitted) during the handshake itself, where
	// the control plane instead tracks identity via the session/connection.
	AgentID   string          `json:"agentId,omitempty"`
	Payload   json.RawMessage `json:"payload"`
	Timestamp time.Time       `json:"timestamp"`
}

// RegisterPayload declares the connecting client's identity hint and kind
// before the real handshake — Kind is always "sensor" here so the real
// control plane creates a sensor-kind pending registration rather than an
// agent one (see packages/control-plane/lib/ws-server.ts
// handleRegisterRequest).
type RegisterPayload struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Kind    string `json:"kind"`
}

// AuthChallengePayload carries one message of the challenge/response
// handshake. Data is "" for the server's very first message (which only
// hands the client a SessionID to correlate the exchange).
type AuthChallengePayload struct {
	SessionID string `json:"sessionId"`
	Data      string `json:"data"`
}

// AuthCompletePayload confirms a successful, connected handshake.
type AuthCompletePayload struct {
	DID string `json:"did"`
}

// AuthFailedPayload explains why the connection was refused or dropped.
type AuthFailedPayload struct {
	Reason string `json:"reason"`
}

// PendingApprovalPayload tells the client its DID is now awaiting operator
// approval (GET/POST /v1/pending on the collector).
type PendingApprovalPayload struct {
	DID string `json:"did"`
}

// RegistrationPendingPayload is the real control plane's version of
// PendingApprovalPayload, sent with a registration ID rather than a DID
// (packages/shared/src/types.ts WSRegistrationPendingPayload).
type RegistrationPendingPayload struct {
	RegistrationID string `json:"registrationId"`
	Message        string `json:"message"`
}

// RegistrationApprovedPayload accompanies MsgRegistrationApproved — a
// standalone-collector-only message the real control plane never sends
// (packages/controlplane/lib/ws-server.ts uses MsgCertChallenge for this
// instead, see below); kept for compatibility with that older target.
type RegistrationApprovedPayload struct {
	RegistrationID string   `json:"registrationId"`
	Capabilities   []string `json:"capabilities"`
}

// SensorTelemetryPayload carries a batch of telemetry events.
type SensorTelemetryPayload struct {
	Events []telemetry.Event `json:"events"`
}

// CertChallengePayload mirrors AuthChallengePayload exactly — same mechanics, a different
// sub-protocol (service:"certificate" instead of "auth"). Data is "" for the control plane's
// opening message of this exchange, same convention as the auth handshake's own opening message.
type CertChallengePayload struct {
	SessionID string `json:"sessionId"`
	Data      string `json:"data"`
}

// CertIssuedPayload confirms the certificate round completed. Capabilities is the actual, plain
// (unsigned) list of what was granted — not something read back out of the certificate's own
// metadata, which this exchange deliberately carries none of (see CertHandshake's doc comment).
type CertIssuedPayload struct {
	CertID       string   `json:"certId"`
	Certificate  string   `json:"certificate"`
	Capabilities []string `json:"capabilities"`
}

// CertFailedPayload explains why the certificate round didn't complete.
type CertFailedPayload struct {
	Reason string `json:"reason"`
}

// CapabilityRequestPayload mirrors packages/controlplane/lib/protocol.ts's
// CapabilityRequestPayload exactly — no signature needed, the connection
// itself already proved identity.
type CapabilityRequestPayload struct {
	RequestedCapabilities []string `json:"requestedCapabilities"`
}

// NewEnvelope builds an Envelope with a fresh message ID and the current
// timestamp, JSON-encoding payload.
func NewEnvelope(t MessageType, payload any) (Envelope, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return Envelope{}, fmt.Errorf("vconn: encoding %s payload: %w", t, err)
	}
	return Envelope{
		MessageID: NewMessageID(),
		Type:      t,
		Payload:   raw,
		Timestamp: time.Now(),
	}, nil
}

// Decode unmarshals the envelope's payload into v.
func (e Envelope) Decode(v any) error {
	return json.Unmarshal(e.Payload, v)
}

// NewMessageID returns a random 16-hex-character token. Exported because a
// consumer building its own server side of this protocol (the sensor's
// reference collector) needs the same generator for session ids.
func NewMessageID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
