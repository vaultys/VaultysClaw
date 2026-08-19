// Package grant verifies capability-grant certificates offline, against the
// control plane's public key alone.
//
// Why this exists rather than reusing internal/vconn's CapabilityState: that
// type persists the granted capability list as plain JSON with no signature
// over it, because a Challenger certificate carries no signed metadata (see
// the control plane's CertIssuedPayload doc comment — a Go-side Challenger bug
// makes non-empty signed metadata unverifiable, so capabilities travel as a
// plain adjacent field). For telemetry that is acceptable: the worst case is a
// sensor reporting something it should not. For *enforcement* it is not —
// anyone with local write access to that file would grant themselves
// internet_access. docs/PROXY_ARCHITECTURE.md §9.2.
//
// So the intercept path runs on a packcert-format grant instead
// (packages/policy/src/certs/capability-grant.ts), whose msgpack body is
// covered by the control plane's signature and is therefore re-verifiable
// after a restart with no live connection.
//
// # What a signed grant does and does not prove
//
// A verified grant token proves *what was granted*: capabilities, scope,
// limits, expiry, and the agent it was granted to. It cannot prove the grant is
// still valid, because revocation is a control-plane fact recorded after
// issuance and deliberately not in the signed bytes. Current status is
// therefore asserted separately by the config push, and that assertion is only
// as fresh as the last successful sync — which is exactly what
// docs/PROXY_ARCHITECTURE.md §7.1's staleness bound governs. Never treat a
// valid signature as evidence a certificate is live.
package grant

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

var (
	// ErrMalformed means the token is not a packcert envelope at all.
	ErrMalformed = errors.New("grant: malformed certificate token")
	// ErrBadSignature means the envelope is well-formed but was not signed by
	// the identity it was checked against. Never retry, never degrade to
	// unverified use — this is either the wrong trust anchor or a forgery.
	ErrBadSignature = errors.New("grant: signature verification failed")
	// ErrWrongType means the payload verified but is not a capability grant
	// (e.g. an intent or peer-grant cert reached this code path).
	ErrWrongType = errors.New("grant: not a capability_grant certificate")
	// ErrExpired means the grant verified but its own signed expiry has
	// passed. Distinguished from ErrBadSignature so a caller can report the
	// difference: one is an operational condition, the other is an attack or a
	// misconfiguration.
	ErrExpired = errors.New("grant: certificate has expired")
)

// certType is the discriminator packages/policy writes into every grant body.
const certType = "capability_grant"

// Body mirrors packages/policy/src/certs/capability-grant.ts's
// CapabilityGrantBody field for field, under the same msgpack keys the
// TypeScript signer emits.
//
// These wire structs are deliberately separate from internal/authz's — that
// package stays pure logic with no serialization dependency, and an explicit
// conversion (ToCertificate) is a place a mismatch can be tested rather than a
// silent shared-struct assumption.
type Body struct {
	Type                string      `msgpack:"type"`
	CertID              string      `msgpack:"certId"`
	AgentDID            string      `msgpack:"agentDid"`
	WorkspaceID         *string     `msgpack:"workspaceId"`
	GrantedCapabilities []string    `msgpack:"grantedCapabilities"`
	ResourceLimits      *WireLimits `msgpack:"resourceLimits"`
	Scope               *WireScope  `msgpack:"scope"`
	RequestCert         string      `msgpack:"requestCert"`
	IssuedAt            int64       `msgpack:"issuedAt"`
	ExpiresAt           *int64      `msgpack:"expiresAt"`
}

// WireLimits mirrors packages/policy's ResourceLimits on the wire.
type WireLimits struct {
	MaxTokensPerDay    *int     `msgpack:"maxTokensPerDay"`
	MaxRequestsPerHour *int     `msgpack:"maxRequestsPerHour"`
	AllowedDomains     []string `msgpack:"allowedDomains"`
}

// WireScope mirrors packages/policy's CertScope on the wire. Optional fields
// are omitted by the TypeScript signer when unset, so every field here must
// tolerate being absent.
type WireScope struct {
	Resource        string `msgpack:"resource"`
	ResourcePattern string `msgpack:"resourcePattern"`
	MaxUses         *int   `msgpack:"maxUses"`
	Purpose         string `msgpack:"purpose"`
}

// unpack splits a packcert token into its msgpack body and raw signature.
//
// The envelope is base64( 4-byte-LE bodyLen | msgpack(body) | signature ),
// defined once in packages/policy/src/certs/codec.ts. Standard base64 with
// padding, matching Node's Buffer.toString("base64") there.
func unpack(token string) (body, signature []byte, err error) {
	combined, err := base64.StdEncoding.DecodeString(token)
	if err != nil {
		return nil, nil, fmt.Errorf("%w: invalid base64: %v", ErrMalformed, err)
	}
	if len(combined) < 5 {
		return nil, nil, fmt.Errorf("%w: token too short (%d bytes)", ErrMalformed, len(combined))
	}

	bodyLen := binary.LittleEndian.Uint32(combined[:4])
	// The declared length must leave room for itself and at least one
	// signature byte. An unsigned body would otherwise "verify" against an
	// empty signature on a permissive verifier.
	if uint64(len(combined)) <= uint64(4)+uint64(bodyLen) {
		return nil, nil, fmt.Errorf(
			"%w: declared body length %d leaves no signature in a %d-byte token",
			ErrMalformed, bodyLen, len(combined),
		)
	}

	return combined[4 : 4+bodyLen], combined[4+bodyLen:], nil
}

// Open verifies token's signature against serverID and returns the raw,
// still-encoded msgpack body.
//
// Exported so other packages can carry their own payload shapes inside the same
// signed envelope without reimplementing it — internal/rules signs rule sets
// this way (docs/PROXY_ARCHITECTURE.md §5.2.0). This package owns the envelope;
// callers own what is inside it.
//
// The returned bytes have had their signature checked and nothing else: the
// caller is responsible for decoding them and validating the result.
func Open(serverID *vaultysid.VaultysID, token string) ([]byte, error) {
	rawBody, signature, err := unpack(token)
	if err != nil {
		return nil, err
	}
	if err := serverID.VerifyChallenge(rawBody, signature); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrBadSignature, err)
	}
	return rawBody, nil
}

// Verify checks token's signature against serverID and returns its decoded
// body. Fully offline: no network, no clock skew allowance, no control-plane
// round trip — the only input beyond the token is the control plane's public
// key (see Anchor).
//
// now is injected rather than read from the clock so the expiry check is
// testable; pass time.Now() in production.
func Verify(serverID *vaultysid.VaultysID, token string, now time.Time) (*Body, error) {
	rawBody, err := Open(serverID, token)
	if err != nil {
		return nil, err
	}

	// Decoding happens only after the signature checks out, so a malformed or
	// hostile payload never reaches the decoder on an unverified path.
	var body Body
	if err := msgpack.Unmarshal(rawBody, &body); err != nil {
		return nil, fmt.Errorf("%w: decoding body: %v", ErrMalformed, err)
	}

	if body.Type != certType {
		return nil, fmt.Errorf("%w: got type %q", ErrWrongType, body.Type)
	}
	if body.ExpiresAt != nil && *body.ExpiresAt <= now.UnixMilli() {
		return nil, fmt.Errorf("%w: expired at %d", ErrExpired, *body.ExpiresAt)
	}

	return &body, nil
}

// ToCertificate converts a verified grant body into the shape
// internal/authz decides on.
//
// status is supplied by the caller, not read from the body, because a signed
// grant cannot carry its own revocation state (see the package comment). Pass
// the status the control plane most recently asserted for this certificate —
// and honour the staleness bound on that assertion before trusting it.
func (b *Body) ToCertificate(status authz.CertificateStatus) authz.Certificate {
	caps := make([]authz.Capability, 0, len(b.GrantedCapabilities))
	for _, c := range b.GrantedCapabilities {
		caps = append(caps, authz.Capability(c))
	}

	cert := authz.Certificate{
		ID:           b.CertID,
		AgentDID:     b.AgentDID,
		Capabilities: caps,
		Status:       status,
		IssuedAt:     b.IssuedAt,
		ExpiresAt:    b.ExpiresAt,
	}

	if l := b.ResourceLimits; l != nil {
		cert.ResourceLimits = &authz.ResourceLimits{
			MaxTokensPerDay:    l.MaxTokensPerDay,
			MaxRequestsPerHour: l.MaxRequestsPerHour,
			AllowedDomains:     l.AllowedDomains,
		}
	}
	if s := b.Scope; s != nil {
		cert.Scope = &authz.CertScope{
			Resource:        s.Resource,
			ResourcePattern: s.ResourcePattern,
			MaxUses:         s.MaxUses,
			Purpose:         s.Purpose,
		}
	}

	return cert
}
