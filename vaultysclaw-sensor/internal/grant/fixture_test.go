package grant

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
)

// fixturePath holds a capability-grant certificate signed by the *TypeScript*
// implementation (packages/policy). Regenerate with:
//
//	pnpm tsx conformance/generate-grant-fixture.ts
//
// It lives outside this Go module deliberately: like the permission vectors, it
// is a contract between two implementations rather than a fixture belonging to
// either (docs/PROXY_ARCHITECTURE.md §3.3).
const fixturePath = "../../../conformance/grant-fixture.json"

type grantFixture struct {
	Version        int    `json:"version"`
	ServerIDBase64 string `json:"serverIdBase64"`
	ServerDID      string `json:"serverDid"`
	Token          string `json:"token"`
	ExpectedBody   struct {
		Type                string   `json:"type"`
		CertID              string   `json:"certId"`
		AgentDID            string   `json:"agentDid"`
		GrantedCapabilities []string `json:"grantedCapabilities"`
		ResourceLimits      struct {
			AllowedDomains     []string `json:"allowedDomains"`
			MaxRequestsPerHour *int     `json:"maxRequestsPerHour"`
		} `json:"resourceLimits"`
		Scope struct {
			ResourcePattern string `json:"resourcePattern"`
			MaxUses         *int   `json:"maxUses"`
		} `json:"scope"`
		IssuedAt  int64  `json:"issuedAt"`
		ExpiresAt *int64 `json:"expiresAt"`
	} `json:"expectedBody"`
}

func loadFixture(t *testing.T) grantFixture {
	t.Helper()
	raw, err := os.ReadFile(filepath.Clean(fixturePath))
	if err != nil {
		t.Fatalf("reading %s: %v (regenerate with: pnpm tsx conformance/generate-grant-fixture.ts)", fixturePath, err)
	}
	var f grantFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("parsing %s: %v", fixturePath, err)
	}
	if f.Token == "" || f.ServerIDBase64 == "" {
		t.Fatalf("%s is missing a token or server id", fixturePath)
	}
	return f
}

// TestVerifiesATokenSignedByTypeScript is the interop gate. Every Go-only test
// in grant_test.go would still pass if this implementation used a different
// base64 variant, different msgpack key names, or a different signing scheme
// than the control plane actually emits — each of which would fail in
// production and nowhere else. This is the only test that catches that.
func TestVerifiesATokenSignedByTypeScript(t *testing.T) {
	f := loadFixture(t)

	rawID, err := base64.StdEncoding.DecodeString(f.ServerIDBase64)
	if err != nil {
		t.Fatalf("decoding server id: %v", err)
	}
	serverID, err := vaultysid.FromID(rawID, nil)
	if err != nil {
		t.Fatalf("reconstructing the TypeScript signer's identity from its id: %v", err)
	}

	// The DID derivation must agree too — if it does not, the two sides would
	// disagree about *who* signed a certificate even when the signature checks
	// out.
	if got := serverID.DID(); got != f.ServerDID {
		t.Errorf("DID derived from the same id differs: Go %q, TypeScript %q", got, f.ServerDID)
	}

	body, err := Verify(serverID, f.Token, time.Now())
	if err != nil {
		t.Fatalf("Verify on a TypeScript-signed grant: %v", err)
	}

	want := f.ExpectedBody
	if body.Type != want.Type {
		t.Errorf("type = %q, want %q", body.Type, want.Type)
	}
	if body.CertID != want.CertID {
		t.Errorf("certId = %q, want %q", body.CertID, want.CertID)
	}
	if body.AgentDID != want.AgentDID {
		t.Errorf("agentDid = %q, want %q", body.AgentDID, want.AgentDID)
	}
	if body.IssuedAt != want.IssuedAt {
		t.Errorf("issuedAt = %d, want %d (a mismatch here means the number encoding differs)", body.IssuedAt, want.IssuedAt)
	}
	if body.ExpiresAt == nil || want.ExpiresAt == nil || *body.ExpiresAt != *want.ExpiresAt {
		t.Errorf("expiresAt = %v, want %v", body.ExpiresAt, want.ExpiresAt)
	}

	if len(body.GrantedCapabilities) != len(want.GrantedCapabilities) {
		t.Fatalf("grantedCapabilities = %v, want %v", body.GrantedCapabilities, want.GrantedCapabilities)
	}
	for i, c := range want.GrantedCapabilities {
		if body.GrantedCapabilities[i] != c {
			t.Errorf("grantedCapabilities[%d] = %q, want %q", i, body.GrantedCapabilities[i], c)
		}
	}

	// Nested objects are where msgpack key-name mismatches hide: a top-level
	// field decoding correctly says nothing about resourceLimits or scope.
	if body.ResourceLimits == nil {
		t.Fatal("resourceLimits decoded as nil — a nested msgpack key mismatch")
	}
	if len(body.ResourceLimits.AllowedDomains) != len(want.ResourceLimits.AllowedDomains) {
		t.Errorf("allowedDomains = %v, want %v", body.ResourceLimits.AllowedDomains, want.ResourceLimits.AllowedDomains)
	}
	if body.ResourceLimits.MaxRequestsPerHour == nil ||
		*body.ResourceLimits.MaxRequestsPerHour != *want.ResourceLimits.MaxRequestsPerHour {
		t.Errorf("maxRequestsPerHour = %v, want %v",
			body.ResourceLimits.MaxRequestsPerHour, want.ResourceLimits.MaxRequestsPerHour)
	}
	if body.Scope == nil {
		t.Fatal("scope decoded as nil — a nested msgpack key mismatch")
	}
	if body.Scope.ResourcePattern != want.Scope.ResourcePattern {
		t.Errorf("scope.resourcePattern = %q, want %q", body.Scope.ResourcePattern, want.Scope.ResourcePattern)
	}
	if body.Scope.MaxUses == nil || *body.Scope.MaxUses != *want.Scope.MaxUses {
		t.Errorf("scope.maxUses = %v, want %v", body.Scope.MaxUses, want.Scope.MaxUses)
	}

	// The embedded co-signature must survive as an opaque string — the Go side
	// never unpacks it, but dropping it would silently discard the agent's own
	// signed request.
	if body.RequestCert == "" {
		t.Error("requestCert is empty — the embedded co-signature was lost")
	}
}

// TestRejectsTheFixtureUnderTheWrongAnchor confirms the interop test above is
// actually checking a signature, not just decoding bytes that happen to parse.
func TestRejectsTheFixtureUnderTheWrongAnchor(t *testing.T) {
	f := loadFixture(t)
	impostor, err := vaultysid.GenerateMachine()
	if err != nil {
		t.Fatalf("generating identity: %v", err)
	}

	if _, err := Verify(impostor, f.Token, time.Now()); err == nil {
		t.Fatal("a TypeScript-signed grant verified against an unrelated identity")
	}
}
