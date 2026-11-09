package grant

import (
	"errors"
	"fmt"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
)

// statusType is the discriminator packages/policy writes into a status
// assertion (packages/policy/src/certs/cert-status.ts).
const statusType = "cert_status_response"

var (
	// ErrWrongStatusType means the payload verified but is not a status
	// assertion.
	ErrWrongStatusType = errors.New("grant: not a cert_status_response")
	// ErrStatusMismatch means a verified status assertion does not belong with
	// the grant or the holder it was presented for: another certificate,
	// another Actor, or addressed to someone else. Never fall back to treating
	// the grant as unconfirmed-but-usable on this error — it is either a
	// misprovisioned host or a replay.
	ErrStatusMismatch = errors.New("grant: status assertion does not match")
	// ErrUnknownStatus means the assertion carries a status this package does
	// not recognise. Treated as an error rather than mapped to anything, because
	// silently mapping an unknown word to "active" would be the worst choice and
	// any other choice would be a guess.
	ErrUnknownStatus = errors.New("grant: unknown certificate status")
)

// Status is the control plane's signed assertion of a certificate's current
// status — packages/policy's CertStatusResponseBody, under the same msgpack
// keys.
//
// This is the half a packcert grant cannot carry (see the package comment): the
// grant proves what was granted, this proves whether it still is, as of
// CheckedAt. Freshness is measured from CheckedAt — a signed timestamp — and
// never from when a file holding it was written, which anyone with local write
// access can change.
type Status struct {
	Type         string   `msgpack:"type"`
	CertID       string   `msgpack:"certId"`
	AgentDID     string   `msgpack:"agentDid"`
	Status       string   `msgpack:"status"`
	Capabilities []string `msgpack:"capabilities"`
	CheckedAt    int64    `msgpack:"checkedAt"`
	ExpiresAt    *int64   `msgpack:"expiresAt"`
	// Aud is the DID the assertion was addressed to. Nil on an assertion signed
	// before the field existed, or one that was deliberately unaddressed.
	Aud *string `msgpack:"aud"`
	// Seq orders assertions from one control plane. Nil on an older assertion;
	// use Sequence(), which falls back to CheckedAt.
	Seq *int64 `msgpack:"seq"`
}

// VerifyStatus checks token's signature against serverID and returns the
// decoded assertion. Fully offline.
//
// It does not check the assertion against a grant or a holder — Bind does —
// nor its age, which is the caller's staleness bound to apply.
func VerifyStatus(serverID *vaultysid.VaultysID, token string) (*Status, error) {
	raw, err := Open(serverID, token)
	if err != nil {
		return nil, err
	}
	var st Status
	if err := msgpack.Unmarshal(raw, &st); err != nil {
		return nil, fmt.Errorf("%w: decoding status: %v", ErrMalformed, err)
	}
	if st.Type != statusType {
		return nil, fmt.Errorf("%w: got type %q", ErrWrongStatusType, st.Type)
	}
	if _, err := st.CertificateStatus(); err != nil {
		return nil, err
	}
	return &st, nil
}

// Bind checks that this assertion is about grant and was issued to localDID.
//
// All three must hold:
//   - the same certificate (CertID), or a status for one grant would back
//     another;
//   - the same holder (AgentDID == grant.AgentDID);
//   - addressed to localDID when it is addressed at all. An unaddressed
//     assertion is accepted only because the grant itself is separately
//     required to name localDID — see Body.BindTo.
func (s *Status) Bind(grant *Body, localDID string) error {
	if s.CertID != grant.CertID {
		return fmt.Errorf("%w: status is for certificate %q, the grant is %q", ErrStatusMismatch, s.CertID, grant.CertID)
	}
	if s.AgentDID != grant.AgentDID {
		return fmt.Errorf("%w: status is for holder %q, the grant names %q", ErrStatusMismatch, s.AgentDID, grant.AgentDID)
	}
	if s.Aud != nil && *s.Aud != "" && localDID != "" && *s.Aud != localDID {
		return fmt.Errorf("%w: status was addressed to %q, this host is %q", ErrStatusMismatch, *s.Aud, localDID)
	}
	return nil
}

// Sequence is the ordering key: Seq when present, CheckedAt otherwise.
func (s *Status) Sequence() int64 {
	if s.Seq != nil {
		return *s.Seq
	}
	return s.CheckedAt
}

// CertificateStatus maps the wire status to authz's closed set.
func (s *Status) CertificateStatus() (authz.CertificateStatus, error) {
	switch s.Status {
	case "active":
		return authz.StatusActive, nil
	case "revoked":
		return authz.StatusRevoked, nil
	case "superseded":
		return authz.StatusSuperseded, nil
	case "expired":
		return authz.StatusExpired, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrUnknownStatus, s.Status)
	}
}

// ErrWrongHolder means a verified grant names a different Actor than the host
// presenting it. Another Actor's grant — possibly a more permissive one — must
// never be enforceable here just because it carries a valid signature.
var ErrWrongHolder = errors.New("grant: certificate was granted to a different Actor")

// BindTo checks that this grant was issued to localDID.
func (b *Body) BindTo(localDID string) error {
	if b.AgentDID != localDID {
		return fmt.Errorf("%w: it names %q, this host is %q", ErrWrongHolder, b.AgentDID, localDID)
	}
	return nil
}
