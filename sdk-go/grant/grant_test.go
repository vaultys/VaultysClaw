package grant

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
)

// signBody builds a packcert token the way packages/policy's signCert does:
// base64( 4-byte-LE len | msgpack(body) | signature ). Test-only — production
// code in this repo only ever verifies, never signs, a grant.
func signBody(t *testing.T, vid *vaultysid.VaultysID, body any) string {
	t.Helper()
	raw, err := msgpack.Marshal(body)
	if err != nil {
		t.Fatalf("marshalling body: %v", err)
	}
	sig, err := vid.SignChallenge(raw)
	if err != nil {
		t.Fatalf("signing body: %v", err)
	}
	lenBuf := make([]byte, 4)
	binary.LittleEndian.PutUint32(lenBuf, uint32(len(raw)))
	return base64.StdEncoding.EncodeToString(append(append(lenBuf, raw...), sig...))
}

func validBody() Body {
	expires := time.Now().Add(time.Hour).UnixMilli()
	maxUses := 3
	return Body{
		Type:                certType,
		CertID:              "cert-abc",
		AgentDID:            "did:vaultys:proxy",
		GrantedCapabilities: []string{"internet_access", "api_call"},
		ResourceLimits: &WireLimits{
			AllowedDomains: []string{"api.openai.com", "api.anthropic.com"},
		},
		Scope:       &WireScope{ResourcePattern: "mcp://github/*", MaxUses: &maxUses},
		RequestCert: "embedded-request-token",
		IssuedAt:    time.Now().UnixMilli(),
		ExpiresAt:   &expires,
	}
}

func TestVerifyAcceptsAGenuineGrant(t *testing.T) {
	vid, err := vaultysid.GenerateMachine()
	if err != nil {
		t.Fatalf("generating identity: %v", err)
	}

	want := validBody()
	got, err := Verify(vid, signBody(t, vid, want), time.Now())
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}

	if got.CertID != want.CertID || got.AgentDID != want.AgentDID {
		t.Errorf("identity fields round-tripped wrong: %+v", got)
	}
	if len(got.GrantedCapabilities) != 2 || got.GrantedCapabilities[0] != "internet_access" {
		t.Errorf("capabilities = %v", got.GrantedCapabilities)
	}
	if got.ResourceLimits == nil || len(got.ResourceLimits.AllowedDomains) != 2 {
		t.Errorf("resourceLimits = %+v", got.ResourceLimits)
	}
	if got.Scope == nil || got.Scope.ResourcePattern != "mcp://github/*" {
		t.Errorf("scope = %+v", got.Scope)
	}
	if got.Scope.MaxUses == nil || *got.Scope.MaxUses != 3 {
		t.Errorf("scope.maxUses = %v", got.Scope.MaxUses)
	}
}

func TestVerifyRejectsAnotherIdentitysSignature(t *testing.T) {
	signer, _ := vaultysid.GenerateMachine()
	other, _ := vaultysid.GenerateMachine()

	_, err := Verify(other, signBody(t, signer, validBody()), time.Now())
	if !errors.Is(err, ErrBadSignature) {
		t.Fatalf("err = %v, want ErrBadSignature", err)
	}
}

func TestVerifyRejectsATamperedBody(t *testing.T) {
	vid, _ := vaultysid.GenerateMachine()
	token := signBody(t, vid, validBody())

	// Flip a byte inside the signed body region and confirm the signature no
	// longer checks out. This is the property the whole enforcement path rests
	// on: an attacker who can rewrite local state cannot grant themselves a
	// capability, which is precisely what internal/vconn's plaintext
	// CapabilityState could not promise (§9.2).
	raw, err := base64.StdEncoding.DecodeString(token)
	if err != nil {
		t.Fatalf("decoding token: %v", err)
	}
	raw[10] ^= 0xff
	tampered := base64.StdEncoding.EncodeToString(raw)

	if _, err := Verify(vid, tampered, time.Now()); err == nil {
		t.Fatal("Verify accepted a tampered body")
	}
}

func TestVerifyRejectsCapabilityEscalationByRewriting(t *testing.T) {
	vid, _ := vaultysid.GenerateMachine()
	attacker, _ := vaultysid.GenerateMachine()

	// The concrete attack §9.2 describes: take a real grant, add
	// system_command, re-sign with a key you control. It must fail against the
	// pinned anchor, not merely look different.
	escalated := validBody()
	escalated.GrantedCapabilities = append(escalated.GrantedCapabilities, "system_command")

	if _, err := Verify(vid, signBody(t, attacker, escalated), time.Now()); !errors.Is(err, ErrBadSignature) {
		t.Fatalf("err = %v, want ErrBadSignature", err)
	}
}

func TestVerifyRejectsAnExpiredGrant(t *testing.T) {
	vid, _ := vaultysid.GenerateMachine()
	body := validBody()
	past := time.Now().Add(-time.Minute).UnixMilli()
	body.ExpiresAt = &past

	_, err := Verify(vid, signBody(t, vid, body), time.Now())
	if !errors.Is(err, ErrExpired) {
		t.Fatalf("err = %v, want ErrExpired", err)
	}
}

func TestVerifyAcceptsANonExpiringGrant(t *testing.T) {
	vid, _ := vaultysid.GenerateMachine()
	body := validBody()
	body.ExpiresAt = nil

	if _, err := Verify(vid, signBody(t, vid, body), time.Now()); err != nil {
		t.Fatalf("Verify: %v", err)
	}
}

func TestVerifyRejectsTheWrongCertType(t *testing.T) {
	vid, _ := vaultysid.GenerateMachine()
	body := validBody()
	body.Type = "intent"

	_, err := Verify(vid, signBody(t, vid, body), time.Now())
	if !errors.Is(err, ErrWrongType) {
		t.Fatalf("err = %v, want ErrWrongType", err)
	}
}

func TestVerifyRejectsMalformedEnvelopes(t *testing.T) {
	vid, _ := vaultysid.GenerateMachine()

	// A body length that consumes the entire token leaves no signature. A
	// verifier that accepted this would validate unsigned bytes.
	unsigned := make([]byte, 4+8)
	binary.LittleEndian.PutUint32(unsigned[:4], 8)

	for name, token := range map[string]string{
		"not base64":            "!!!not base64!!!",
		"too short":             base64.StdEncoding.EncodeToString([]byte{1, 2, 3}),
		"length overruns token": base64.StdEncoding.EncodeToString([]byte{0xff, 0xff, 0, 0, 1, 2}),
		"no signature bytes":    base64.StdEncoding.EncodeToString(unsigned),
		"empty":                 "",
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Verify(vid, token, time.Now()); !errors.Is(err, ErrMalformed) {
				t.Fatalf("err = %v, want ErrMalformed", err)
			}
		})
	}
}

func TestToCertificateBridgesToAuthz(t *testing.T) {
	body := validBody()
	cert := body.ToCertificate(authz.StatusActive)

	if cert.ID != body.CertID || cert.Status != authz.StatusActive {
		t.Errorf("cert = %+v", cert)
	}
	if len(cert.Capabilities) != 2 || cert.Capabilities[0] != authz.CapInternetAccess {
		t.Errorf("capabilities = %v", cert.Capabilities)
	}
	if cert.Scope == nil || cert.Scope.ResourcePattern != "mcp://github/*" {
		t.Errorf("scope = %+v", cert.Scope)
	}
	if cert.ResourceLimits == nil || len(cert.ResourceLimits.AllowedDomains) != 2 {
		t.Errorf("resourceLimits = %+v", cert.ResourceLimits)
	}

	// The status is the caller's assertion, never the body's — a revoked
	// certificate must produce a certificate authz refuses, even though its
	// signature is still perfectly valid.
	revoked := body.ToCertificate(authz.StatusRevoked)
	d := authz.Resolve(authz.RequestedAction{Capability: authz.CapInternetAccess}, []authz.Certificate{revoked}, time.Now().UnixMilli())
	if d.Allowed {
		t.Error("a revoked certificate authorized an action")
	}
}

func TestAnchorPinsOnFirstUseAndRefusesToChange(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "anchor.json")
	server, _ := vaultysid.GenerateMachine()
	impostor, _ := vaultysid.GenerateMachine()

	if _, err := LoadAnchor(path); !errors.Is(err, ErrNoAnchor) {
		t.Fatalf("LoadAnchor on a fresh host: err = %v, want ErrNoAnchor", err)
	}

	pinned, err := Pin(path, server)
	if err != nil {
		t.Fatalf("Pin: %v", err)
	}
	if pinned.DID() != server.DID() {
		t.Errorf("pinned DID = %s, want %s", pinned.DID(), server.DID())
	}

	// Re-pinning the same identity is the normal path on every reconnect.
	if _, err := Pin(path, server); err != nil {
		t.Fatalf("re-Pin with the same identity: %v", err)
	}

	// A different identity must be refused, not silently accepted.
	if _, err := Pin(path, impostor); !errors.Is(err, ErrAnchorMismatch) {
		t.Fatalf("Pin with a different identity: err = %v, want ErrAnchorMismatch", err)
	}

	// And the refusal must not have rewritten the pin.
	reloaded, err := LoadAnchor(path)
	if err != nil {
		t.Fatalf("LoadAnchor after a refused re-pin: %v", err)
	}
	if reloaded.DID() != server.DID() {
		t.Fatalf("anchor was overwritten: DID = %s, want %s", reloaded.DID(), server.DID())
	}
}

func TestAnchorSurvivesRestartAndStillVerifies(t *testing.T) {
	path := filepath.Join(t.TempDir(), "anchor.json")
	server, _ := vaultysid.GenerateMachine()
	token := signBody(t, server, validBody())

	if _, err := Pin(path, server); err != nil {
		t.Fatalf("Pin: %v", err)
	}

	// The point of the anchor: after a restart, with no live connection, a
	// reconstructed verify-only identity still validates a grant signed by the
	// real control plane.
	reloaded, err := LoadAnchor(path)
	if err != nil {
		t.Fatalf("LoadAnchor: %v", err)
	}
	if _, err := Verify(reloaded.VaultysID(), token, time.Now()); err != nil {
		t.Fatalf("Verify with a reloaded anchor: %v", err)
	}
}

func TestPinFromConfigClosesTheTOFUWindow(t *testing.T) {
	path := filepath.Join(t.TempDir(), "anchor.json")
	server, _ := vaultysid.GenerateMachine()
	idB64 := base64.StdEncoding.EncodeToString(server.ID())

	anchor, err := PinFromConfig(path, idB64)
	if err != nil {
		t.Fatalf("PinFromConfig: %v", err)
	}
	if anchor.DID() != server.DID() {
		t.Errorf("DID = %s, want %s", anchor.DID(), server.DID())
	}

	if _, err := PinFromConfig(path, "not base64!"); err == nil {
		t.Error("PinFromConfig accepted invalid base64")
	}
}
