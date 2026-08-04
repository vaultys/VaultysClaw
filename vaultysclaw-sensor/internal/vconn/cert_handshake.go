package vconn

import (
	"encoding/base64"
	"fmt"

	"github.com/vaultys/vaultysid/go/pkg/challenger"
	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
)

// CertHandshakeProtocol/CertHandshakeService identify the certificate-issuance
// sub-protocol (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b) — a second, independent
// live Challenger exchange over the same already-authenticated connection,
// distinct from the connection auth handshake ("p2p"/"auth", see handshake.go).
const (
	CertHandshakeProtocol = "p2p"
	CertHandshakeService  = "certificate"
)

// CertHandshake drives the sensor's side of a service:"certificate" exchange.
// The control plane proactively initiates this (an empty cert_challenge) once
// an admin approves a capability grant; the sensor is the Challenger
// *initiator* here — the mirror image of the connection auth handshake, where
// the control plane is the responder and the sensor initiates.
//
// The certificate itself carries no metadata (deliberately — see
// packages/controlplane/lib/protocol.ts's CertIssuedPayload doc comment for
// why: this library's Step2/Finalize have a verification bug on non-empty
// metadata). The capabilities actually granted arrive as a plain field on the
// cert_issued envelope instead, read directly in client.go.
type CertHandshake struct {
	ch *challenger.Challenger
}

func NewCertHandshake(vid *vaultysid.VaultysID) *CertHandshake {
	opts := &challenger.ChallengerOptions{Version: challenger.ProtocolV1, TimeWindow: handshakeTimeWindow}
	return &CertHandshake{ch: challenger.NewChallenger(vid, opts)}
}

// Start begins the handshake as the initiating side, returning the first
// base64-encoded challenge to send back in response to the control plane's
// opening (empty-data) cert_challenge.
func (h *CertHandshake) Start() (string, error) {
	c, err := h.ch.Init(CertHandshakeProtocol, CertHandshakeService)
	if err != nil {
		return "", fmt.Errorf("vconn: init cert handshake: %w", err)
	}
	return encodeChallenge(c)
}

// Accept processes an incoming base64-encoded challenge and returns the next
// challenge to send, or "" once nothing more is needed from this side.
func (h *CertHandshake) Accept(dataB64 string) (nextB64 string, err error) {
	raw, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return "", fmt.Errorf("vconn: decoding cert challenge: %w", err)
	}
	resp, err := h.ch.Accept(raw)
	if err != nil {
		return "", fmt.Errorf("vconn: processing cert challenge: %w", err)
	}
	if resp == nil {
		return "", nil
	}
	return encodeChallenge(resp)
}

// IsComplete reports whether this side has finished the handshake.
func (h *CertHandshake) IsComplete() bool { return h.ch.IsComplete() }
