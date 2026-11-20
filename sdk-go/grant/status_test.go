package grant

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
)

// update rewrites conformance/status-request-fixture.json from this side.
var update = flag.Bool("update", false, "rewrite the Go-signed conformance fixtures")

const (
	statusFixturePath        = "../../conformance/status-fixture.json"
	statusRequestFixturePath = "../../conformance/status-request-fixture.json"
)

type statusFixture struct {
	ServerIDBase64    string `json:"serverIdBase64"`
	RequesterSeedHex  string `json:"requesterSeedHex"`
	RequesterIDBase64 string `json:"requesterIdBase64"`
	RequesterDID      string `json:"requesterDid"`
	Token             string `json:"token"`
	ExpectedBody      struct {
		CertID         string   `json:"certId"`
		AgentDID       string   `json:"agentDid"`
		Status         string   `json:"status"`
		Capabilities   []string `json:"capabilities"`
		ResourceLimits struct {
			MaxRequestsPerHour *int     `json:"maxRequestsPerHour"`
			AllowedDomains     []string `json:"allowedDomains"`
		} `json:"resourceLimits"`
		Scope struct {
			ResourcePattern string `json:"resourcePattern"`
			MaxUses         *int   `json:"maxUses"`
		} `json:"scope"`
		CheckedAt int64  `json:"checkedAt"`
		ExpiresAt *int64 `json:"expiresAt"`
	} `json:"expectedBody"`
}

func loadStatusFixture(t *testing.T) (statusFixture, *vaultysid.VaultysID) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Clean(statusFixturePath))
	if err != nil {
		t.Fatalf("reading %s: %v (regenerate with: pnpm tsx conformance/generate-status-fixture.ts)", statusFixturePath, err)
	}
	var f statusFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	idBytes, err := base64.StdEncoding.DecodeString(f.ServerIDBase64)
	if err != nil {
		t.Fatal(err)
	}
	server, err := vaultysid.FromID(idBytes, nil)
	if err != nil {
		t.Fatal(err)
	}
	return f, server
}

// TestStatusResponseFixture verifies a response signed by the TypeScript
// control plane and checks every field decoded into the Go struct.
func TestStatusResponseFixture(t *testing.T) {
	f, server := loadStatusFixture(t)
	resp, err := VerifyStatusResponse(server, f.Token, time.Now(), 0)
	if err != nil {
		t.Fatalf("TS-signed status response must verify: %v", err)
	}
	e := f.ExpectedBody
	if resp.CertID != e.CertID || resp.AgentDID != e.AgentDID || resp.Status != e.Status {
		t.Fatalf("identity fields: got %+v", resp)
	}
	if resp.CertificateStatus() != authz.StatusRevoked {
		t.Fatalf("status = %q, want revoked", resp.Status)
	}
	if !reflect.DeepEqual(resp.Capabilities, e.Capabilities) {
		t.Fatalf("capabilities = %v, want %v", resp.Capabilities, e.Capabilities)
	}
	if resp.ResourceLimits == nil || resp.ResourceLimits.MaxRequestsPerHour == nil ||
		*resp.ResourceLimits.MaxRequestsPerHour != *e.ResourceLimits.MaxRequestsPerHour ||
		!reflect.DeepEqual(resp.ResourceLimits.AllowedDomains, e.ResourceLimits.AllowedDomains) {
		t.Fatalf("resourceLimits = %+v", resp.ResourceLimits)
	}
	if resp.Scope == nil || resp.Scope.ResourcePattern != e.Scope.ResourcePattern ||
		resp.Scope.MaxUses == nil || *resp.Scope.MaxUses != *e.Scope.MaxUses {
		t.Fatalf("scope = %+v", resp.Scope)
	}
	if resp.CheckedAt != e.CheckedAt || resp.ExpiresAt == nil || *resp.ExpiresAt != *e.ExpiresAt {
		t.Fatalf("times: checkedAt=%d expiresAt=%v", resp.CheckedAt, resp.ExpiresAt)
	}

	// The age bound applies against CheckedAt.
	late := resp.CheckedAtTime().Add(2 * time.Hour)
	if _, err := VerifyStatusResponse(server, f.Token, late, time.Hour); !errors.Is(err, ErrStatusTooOld) {
		t.Fatalf("a response older than maxAge must be refused, got %v", err)
	}
	if _, err := VerifyStatusResponse(server, f.Token, late, 3*time.Hour); err != nil {
		t.Fatalf("within maxAge: %v", err)
	}
}

func TestStatusResponseRejectsOtherKeysAndTypes(t *testing.T) {
	f, _ := loadStatusFixture(t)
	other, err := vaultysid.GenerateMachine()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyStatusResponse(other, f.Token, time.Now(), 0); !errors.Is(err, ErrBadSignature) {
		t.Fatalf("wrong anchor must fail the signature, got %v", err)
	}
	// A grant fixture is a valid packcert from the same key, but not a status response.
	g := loadFixture(t)
	_, server := loadStatusFixture(t)
	if _, err := VerifyStatusResponse(server, g.Token, time.Now(), 0); !errors.Is(err, ErrWrongType) {
		t.Fatalf("a capability grant must not pass as a status response, got %v", err)
	}
	// A status response signed with a status outside the union.
	forged, err := Sign(other, map[string]any{"type": statusResponseType, "certId": "x", "status": "suspended", "checkedAt": 1})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyStatusResponse(other, forged, time.Now(), 0); !errors.Is(err, ErrUnknownStatus) {
		t.Fatalf("a fifth status must be refused, got %v", err)
	}
}

// requester derives the fixture's second throwaway identity. Doubles as a check
// that Go and TypeScript derive the same identity from the same entropy.
func requester(t *testing.T, f statusFixture) *vaultysid.VaultysID {
	t.Helper()
	seed, err := hex.DecodeString(f.RequesterSeedHex)
	if err != nil {
		t.Fatal(err)
	}
	id, err := vaultysid.MachineFromEntropy(seed)
	if err != nil {
		t.Fatal(err)
	}
	if id.DID() != f.RequesterDID {
		t.Fatalf("Go derives %s from the fixture seed, TypeScript %s", id.DID(), f.RequesterDID)
	}
	if got := base64.StdEncoding.EncodeToString(id.ID()); got != f.RequesterIDBase64 {
		t.Fatalf("Go id %s, TypeScript id %s", got, f.RequesterIDBase64)
	}
	return id
}

type statusRequestFixture struct {
	Comment           []string `json:"$comment"`
	Version           int      `json:"version"`
	RequesterIDBase64 string   `json:"requesterIdBase64"`
	RequesterDID      string   `json:"requesterDid"`
	Token             string   `json:"token"`
	ExpectedBody      struct {
		Type         string `json:"type"`
		CertID       string `json:"certId"`
		RequesterDID string `json:"requesterDid"`
		Nonce        string `json:"nonce"`
		IssuedAt     int64  `json:"issuedAt"`
	} `json:"expectedBody"`
}

// TestStatusRequestFixture signs a request with the fixture's requester key and
// checks it matches the committed Go→TS fixture byte for byte (Ed25519 is
// deterministic and issuedAt is fixed). -update rewrites it.
func TestStatusRequestFixture(t *testing.T) {
	f, _ := loadStatusFixture(t)
	id := requester(t, f)
	issued := time.UnixMilli(1794500000000)
	token, err := SignStatusRequest(id, "cert-status-fixture-0001", "nonce-6b1f2c", issued)
	if err != nil {
		t.Fatal(err)
	}
	req, err := VerifyStatusRequest(id, token)
	if err != nil {
		t.Fatalf("own request must verify: %v", err)
	}
	if req.RequesterDID != f.RequesterDID || req.IssuedAt != issued.UnixMilli() {
		t.Fatalf("request body = %+v", req)
	}

	if *update {
		out := statusRequestFixture{
			Comment: []string{
				"Generated by sdk-go/grant/status_test.go — do not hand-edit.",
				"Regenerate: cd sdk-go && go test ./grant -run TestStatusRequestFixture -update",
				"",
				"A cert_status_request signed by Go's SignStatusRequest with the throwaway",
				"requester key from status-fixture.json, verified by packages/policy's",
				"verifyCertStatusRequestCert (__tests__/status-conformance.test.ts) — the",
				"exact check the control plane's handleCertStatusRequest runs.",
			},
			Version:           1,
			RequesterIDBase64: f.RequesterIDBase64,
			RequesterDID:      f.RequesterDID,
			Token:             token,
		}
		out.ExpectedBody.Type = req.Type
		out.ExpectedBody.CertID = req.CertID
		out.ExpectedBody.RequesterDID = req.RequesterDID
		out.ExpectedBody.Nonce = req.Nonce
		out.ExpectedBody.IssuedAt = req.IssuedAt
		data, err := json.MarshalIndent(out, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(statusRequestFixturePath, append(data, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}

	raw, err := os.ReadFile(statusRequestFixturePath)
	if err != nil {
		t.Fatalf("reading %s: %v (regenerate with -update)", statusRequestFixturePath, err)
	}
	var committed statusRequestFixture
	if err := json.Unmarshal(raw, &committed); err != nil {
		t.Fatal(err)
	}
	if committed.Token != token {
		t.Fatal("the committed Go→TS request fixture no longer matches what SignStatusRequest produces; " +
			"regenerate with -update and re-run packages/policy's status-conformance test")
	}
}

func TestApplyStatusOnlyNarrows(t *testing.T) {
	b := &Body{CertID: "c1", AgentDID: "did:x", GrantedCapabilities: []string{"file_read", "code_execution", "acme:deploy"}}
	resp := &StatusResponse{CertID: "c1", Status: "active", Capabilities: []string{"file_read", "internet_access"}}
	cert := b.ApplyStatus(resp)
	if cert.Status != authz.StatusActive {
		t.Fatalf("status = %q", cert.Status)
	}
	if len(cert.Capabilities) != 1 || cert.Capabilities[0] != "file_read" {
		t.Fatalf("a status response must narrow to the intersection, got %v", cert.Capabilities)
	}
}

func TestSignStatusRequestNeedsIDs(t *testing.T) {
	id, _ := vaultysid.GenerateMachine()
	if _, err := SignStatusRequest(id, "", "n", time.Now()); err == nil {
		t.Fatal("empty cert id must be refused")
	}
}
