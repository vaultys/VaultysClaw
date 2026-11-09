package grant

import (
	"errors"
	"testing"
	"time"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
)

// wireStatus mirrors what packages/policy's signCertStatusResponseCert emits,
// with every field present.
type wireStatus struct {
	Type         string   `msgpack:"type"`
	CertID       string   `msgpack:"certId"`
	AgentDID     string   `msgpack:"agentDid"`
	Status       string   `msgpack:"status"`
	Capabilities []string `msgpack:"capabilities"`
	CheckedAt    int64    `msgpack:"checkedAt"`
	ExpiresAt    *int64   `msgpack:"expiresAt"`
	Aud          *string  `msgpack:"aud"`
	Seq          *int64   `msgpack:"seq"`
}

func strp(s string) *string { return &s }
func i64p(v int64) *int64   { return &v }

func statusFor(b Body, status string) wireStatus {
	now := time.Now().UnixMilli()
	return wireStatus{
		Type: statusType, CertID: b.CertID, AgentDID: b.AgentDID, Status: status,
		Capabilities: b.GrantedCapabilities, CheckedAt: now, Aud: strp(b.AgentDID), Seq: i64p(now),
	}
}

func TestVerifyStatusRoundTripsAndBinds(t *testing.T) {
	vid, err := vaultysid.GenerateMachine()
	if err != nil {
		t.Fatal(err)
	}
	b := validBody()
	st, err := VerifyStatus(vid, signBody(t, vid, statusFor(b, "revoked")))
	if err != nil {
		t.Fatalf("VerifyStatus: %v", err)
	}
	if got, _ := st.CertificateStatus(); got != authz.StatusRevoked {
		t.Errorf("status = %q, want revoked", got)
	}
	if err := st.Bind(&b, b.AgentDID); err != nil {
		t.Errorf("Bind: %v", err)
	}
}

func TestVerifyStatusRejectsForgeryAndWrongType(t *testing.T) {
	vid, _ := vaultysid.GenerateMachine()
	other, _ := vaultysid.GenerateMachine()
	b := validBody()

	if _, err := VerifyStatus(vid, signBody(t, other, statusFor(b, "active"))); !errors.Is(err, ErrBadSignature) {
		t.Errorf("forged status: err = %v, want ErrBadSignature", err)
	}
	// A grant body is validly signed but is not a status assertion.
	if _, err := VerifyStatus(vid, signBody(t, vid, b)); !errors.Is(err, ErrWrongStatusType) {
		t.Errorf("grant presented as status: err = %v, want ErrWrongStatusType", err)
	}
	weird := statusFor(b, "suspended")
	if _, err := VerifyStatus(vid, signBody(t, vid, weird)); !errors.Is(err, ErrUnknownStatus) {
		t.Errorf("unknown status word: err = %v, want ErrUnknownStatus", err)
	}
}

func TestBindRefusesAnotherCertificateHolderOrAudience(t *testing.T) {
	vid, _ := vaultysid.GenerateMachine()
	b := validBody()

	cases := map[string]func(*wireStatus){
		"other certificate": func(w *wireStatus) { w.CertID = "cert-other" },
		"other holder":      func(w *wireStatus) { w.AgentDID = "did:vaultys:other" },
		"other audience":    func(w *wireStatus) { w.Aud = strp("did:vaultys:other") },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			w := statusFor(b, "active")
			mutate(&w)
			st, err := VerifyStatus(vid, signBody(t, vid, w))
			if err != nil {
				t.Fatalf("VerifyStatus: %v", err)
			}
			if err := st.Bind(&b, b.AgentDID); !errors.Is(err, ErrStatusMismatch) {
				t.Errorf("err = %v, want ErrStatusMismatch", err)
			}
		})
	}
}

func TestSequenceFallsBackToCheckedAt(t *testing.T) {
	vid, _ := vaultysid.GenerateMachine()
	w := statusFor(validBody(), "active")
	w.Seq = nil
	w.Aud = nil
	st, err := VerifyStatus(vid, signBody(t, vid, w))
	if err != nil {
		t.Fatal(err)
	}
	if st.Sequence() != w.CheckedAt {
		t.Errorf("Sequence() = %d, want checkedAt %d", st.Sequence(), w.CheckedAt)
	}
}

func TestBindToRefusesAnotherActorsGrant(t *testing.T) {
	b := validBody()
	if err := b.BindTo(b.AgentDID); err != nil {
		t.Errorf("own grant: %v", err)
	}
	if err := b.BindTo("did:vaultys:someone-else"); !errors.Is(err, ErrWrongHolder) {
		t.Errorf("err = %v, want ErrWrongHolder", err)
	}
}
