package grant

// Certificate status checks — the Go half of
// packages/policy/src/certs/cert-status.ts (docs/CERTIFICATE_WEB_OF_TRUST.md
// §4.1).
//
// A signed grant proves what was granted, never that it is still granted (see
// the package comment). The status exchange is what closes that gap: the holder
// signs a cert_status_request, the control plane answers with a
// cert_status_response *signed by its own key*, and the answer — not the socket
// it arrived on — is what the holder relies on. Because it is signed, the
// response can be persisted and re-verified by a process that never saw the
// connection, which is exactly what a per-invocation hook needs.

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"time"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
)

const (
	statusRequestType  = "cert_status_request"
	statusResponseType = "cert_status_response"
)

var (
	// ErrStatusTooOld means a status response verified but was signed longer
	// ago than the caller accepts. Like ErrExpired, an operational condition,
	// not an attack.
	ErrStatusTooOld = errors.New("grant: certificate status response is too old")
	// ErrUnknownStatus means a verified response carries a status outside the
	// closed four-value union. Never mapped to anything: an implementation
	// that grew a fifth status must update this side deliberately.
	ErrUnknownStatus = errors.New("grant: certificate status response carries an unknown status")
)

// StatusRequest mirrors CertStatusRequestBody.
type StatusRequest struct {
	Type         string `msgpack:"type"`
	CertID       string `msgpack:"certId"`
	RequesterDID string `msgpack:"requesterDid"`
	Nonce        string `msgpack:"nonce"`
	IssuedAt     int64  `msgpack:"issuedAt"`
}

// StatusResponse mirrors CertStatusResponseBody.
type StatusResponse struct {
	Type           string      `msgpack:"type"`
	CertID         string      `msgpack:"certId"`
	AgentDID       string      `msgpack:"agentDid"`
	Status         string      `msgpack:"status"`
	Capabilities   []string    `msgpack:"capabilities"`
	ResourceLimits *WireLimits `msgpack:"resourceLimits"`
	Scope          *WireScope  `msgpack:"scope"`
	// CheckedAt is ms since epoch, by the control plane's clock.
	CheckedAt int64 `msgpack:"checkedAt"`
	// ExpiresAt is ms since epoch, nil for a certificate that does not
	// auto-expire.
	ExpiresAt *int64 `msgpack:"expiresAt"`
}

// CheckedAtTime is CheckedAt as a time.
func (r *StatusResponse) CheckedAtTime() time.Time { return time.UnixMilli(r.CheckedAt) }

// CertificateStatus is Status as authz's type. Only valid after
// VerifyStatusResponse, which rejects anything outside the union.
func (r *StatusResponse) CertificateStatus() authz.CertificateStatus {
	return authz.CertificateStatus(r.Status)
}

// pack builds a packcert envelope: base64( 4-byte-LE bodyLen | body | signature ),
// the inverse of unpack.
func pack(body, signature []byte) string {
	out := make([]byte, 4+len(body)+len(signature))
	binary.LittleEndian.PutUint32(out[:4], uint32(len(body)))
	copy(out[4:], body)
	copy(out[4+len(body):], signature)
	return base64.StdEncoding.EncodeToString(out)
}

// Sign msgpack-encodes payload, signs it with signer and returns the packcert
// token — the Go equivalent of packages/policy's signCert. signer must hold its
// secret (an identity loaded with FromSecret or generated locally).
func Sign(signer *vaultysid.VaultysID, payload any) (string, error) {
	body, err := msgpack.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("grant: encoding payload: %w", err)
	}
	sig, err := signer.SignChallenge(body)
	if err != nil {
		return "", fmt.Errorf("grant: signing: %w", err)
	}
	return pack(body, sig), nil
}

// SignStatusRequest builds a cert_status_request signed by the requester. The
// control plane verifies it against the key the connection authenticated with,
// so signer must be the identity this client connected as.
//
// now is injected for testability; pass time.Now() in production.
func SignStatusRequest(signer *vaultysid.VaultysID, certID, nonce string, now time.Time) (string, error) {
	if certID == "" || nonce == "" {
		return "", errors.New("grant: a status request needs a certificate id and a nonce")
	}
	return Sign(signer, StatusRequest{
		Type:         statusRequestType,
		CertID:       certID,
		RequesterDID: signer.DID(),
		Nonce:        nonce,
		IssuedAt:     now.UnixMilli(),
	})
}

// VerifyStatusRequest is the control plane's side, here for symmetry and tests.
func VerifyStatusRequest(requester *vaultysid.VaultysID, token string) (*StatusRequest, error) {
	raw, err := Open(requester, token)
	if err != nil {
		return nil, err
	}
	var req StatusRequest
	if err := msgpack.Unmarshal(raw, &req); err != nil {
		return nil, fmt.Errorf("%w: decoding status request: %v", ErrMalformed, err)
	}
	if req.Type != statusRequestType {
		return nil, fmt.Errorf("%w: got type %q", ErrWrongType, req.Type)
	}
	return &req, nil
}

// VerifyStatusResponse checks a cert_status_response against the control
// plane's key and returns its body.
//
// maxAge, when positive, refuses a response signed more than maxAge before now
// — the same knob verifyCertStatusResponseCert's maxAgeMs is. Zero or negative
// skips the age check: whether a response is fresh *enough to decide on* is
// toolgate's MaxStatusAge, applied at decision time against CheckedAt, not
// something to bake into whether the bytes are authentic.
func VerifyStatusResponse(serverID *vaultysid.VaultysID, token string, now time.Time, maxAge time.Duration) (*StatusResponse, error) {
	raw, err := Open(serverID, token)
	if err != nil {
		return nil, err
	}
	var resp StatusResponse
	if err := msgpack.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("%w: decoding status response: %v", ErrMalformed, err)
	}
	if resp.Type != statusResponseType {
		return nil, fmt.Errorf("%w: got type %q", ErrWrongType, resp.Type)
	}
	switch authz.CertificateStatus(resp.Status) {
	case authz.StatusActive, authz.StatusRevoked, authz.StatusSuperseded, authz.StatusExpired:
	default:
		return nil, fmt.Errorf("%w: %q", ErrUnknownStatus, resp.Status)
	}
	if maxAge > 0 && now.Sub(resp.CheckedAtTime()) > maxAge {
		return nil, fmt.Errorf("%w: checked at %s", ErrStatusTooOld, resp.CheckedAtTime().UTC().Format(time.RFC3339))
	}
	return &resp, nil
}

// ApplyStatus returns the certificate a grant amounts to once the control
// plane's verified status response for it is taken into account: the
// response's status, and **its capability list in place of the grant's**.
//
// Replacing the capabilities is the point, and matches the TypeScript SDK: the
// control plane filters held custom capabilities against its live registry
// before signing, so a capability deleted from the registry disappears here
// even though the grant still lists it. A response can only narrow — a name it
// carries that the grant never granted is dropped, so a status check can never
// widen what was signed at issuance.
//
// The caller must already have checked resp.CertID == b.CertID.
func (b *Body) ApplyStatus(resp *StatusResponse) authz.Certificate {
	cert := b.ToCertificate(resp.CertificateStatus())
	granted := make(map[string]bool, len(b.GrantedCapabilities))
	for _, c := range b.GrantedCapabilities {
		granted[c] = true
	}
	caps := make([]authz.Capability, 0, len(resp.Capabilities))
	for _, c := range resp.Capabilities {
		if granted[c] {
			caps = append(caps, authz.Capability(c))
		}
	}
	cert.Capabilities = caps
	return cert
}
