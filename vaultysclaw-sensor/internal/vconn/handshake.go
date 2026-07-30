package vconn

import (
	"encoding/base64"
	"fmt"
	"time"

	"github.com/vaultys/vaultysid/go/pkg/challenger"
	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
)

// HandshakeProtocol/HandshakeService identify this handshake to the
// Challenger. These must be "p2p"/"auth" to interoperate with the real
// control plane: packages/shared/src/security.ts's verifyProtocol requires
// protocol === "p2p" and service === "register" || "auth", and the real
// agent runtime (packages/agent-runtime/src/base-agent.ts
// startAuthHandshake) initiates with exactly createChallenge("p2p", "auth").
// The standalone reference collector (internal/vconn/server.go) never
// checks these values — it only calls Accept, never Start — so this is
// safe for both targets.
const (
	HandshakeProtocol = "p2p"
	HandshakeService  = "auth"

	handshakeTimeWindow = 60 * time.Second
)

// Handshake drives a real VaultysId challenger handshake from either role,
// via the Go port's existing Init()/Accept() — no reimplementation of the
// protocol state machine. The connection's protocol version is pinned to
// V1, matching packages/control-plane's `vid.toVersion(1)`.
type Handshake struct {
	ch *challenger.Challenger
}

// NewHandshake creates a Handshake for the given local identity.
func NewHandshake(vid *vaultysid.VaultysID) *Handshake {
	opts := &challenger.ChallengerOptions{
		Version:    challenger.ProtocolV1,
		TimeWindow: handshakeTimeWindow,
	}
	return &Handshake{ch: challenger.NewChallenger(vid, opts)}
}

// Start begins the handshake as the initiating side (the sensor), and
// returns the first base64-encoded challenge to send.
func (h *Handshake) Start() (string, error) {
	c, err := h.ch.Init(HandshakeProtocol, HandshakeService)
	if err != nil {
		return "", fmt.Errorf("vconn: init handshake: %w", err)
	}
	return encodeChallenge(c)
}

// Accept processes an incoming base64-encoded challenge and returns the
// next challenge to send back. An empty return with a nil error means
// there is nothing more to send from this side — either the handshake
// finished (check IsComplete), or this side is still waiting on the peer.
func (h *Handshake) Accept(dataB64 string) (nextB64 string, err error) {
	raw, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return "", fmt.Errorf("vconn: decoding challenge: %w", err)
	}
	resp, err := h.ch.Accept(raw)
	if err != nil {
		return "", fmt.Errorf("vconn: processing challenge: %w", err)
	}
	if resp == nil {
		return "", nil
	}
	return encodeChallenge(resp)
}

// IsComplete reports whether this side has finished the handshake.
func (h *Handshake) IsComplete() bool { return h.ch.IsComplete() }

// RemoteDID returns the peer's DID. Only meaningful once IsComplete (or,
// on the responder side, once the peer's identity has been seen at all —
// GetRemoteVaultysID errors out clearly if not).
func (h *Handshake) RemoteDID() (string, error) {
	remote, err := h.ch.GetRemoteVaultysID()
	if err != nil {
		return "", fmt.Errorf("vconn: no remote identity yet: %w", err)
	}
	return remote.DID(), nil
}

func encodeChallenge(c *challenger.Challenge) (string, error) {
	raw, err := challenger.Serialize(c)
	if err != nil {
		return "", fmt.Errorf("vconn: serializing challenge: %w", err)
	}
	return base64.StdEncoding.EncodeToString(raw), nil
}
