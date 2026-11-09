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

// statusFixturePath holds cert_status_response assertions signed by the
// *TypeScript* implementation. Regenerate with:
//
//	pnpm tsx conformance/generate-status-fixture.ts
const statusFixturePath = "../../conformance/status-fixture.json"

type statusFixture struct {
	ServerIDBase64 string `json:"serverIdBase64"`
	Cases          []struct {
		Name     string `json:"name"`
		Token    string `json:"token"`
		Expected struct {
			CertID    string  `json:"certId"`
			AgentDID  string  `json:"agentDid"`
			Status    string  `json:"status"`
			CheckedAt int64   `json:"checkedAt"`
			Aud       *string `json:"aud"`
			Seq       int64   `json:"seq"`
		} `json:"expected"`
	} `json:"cases"`
}

// TestVerifiesStatusSignedByTypeScript is the interop gate for the status
// assertion, as TestVerifiesATokenSignedByTypeScript is for the grant.
func TestVerifiesStatusSignedByTypeScript(t *testing.T) {
	raw, err := os.ReadFile(filepath.Clean(statusFixturePath))
	if err != nil {
		t.Fatalf("reading %s: %v", statusFixturePath, err)
	}
	var f statusFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	rawID, err := base64.StdEncoding.DecodeString(f.ServerIDBase64)
	if err != nil {
		t.Fatal(err)
	}
	serverID, err := vaultysid.FromID(rawID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) == 0 {
		t.Fatal("fixture has no cases")
	}

	// The grant fixture is for the same certificate and holder, so each status
	// must bind to it — the pairing an interception point actually performs.
	grantBody, err := Verify(serverID, loadFixture(t).Token, time.Now())
	if err != nil {
		t.Fatalf("verifying the paired grant fixture: %v", err)
	}

	for _, c := range f.Cases {
		t.Run(c.Name, func(t *testing.T) {
			st, err := VerifyStatus(serverID, c.Token)
			if err != nil {
				t.Fatalf("VerifyStatus: %v", err)
			}
			want := c.Expected
			if st.CertID != want.CertID || st.AgentDID != want.AgentDID || st.Status != want.Status {
				t.Errorf("identity fields = %q/%q/%q, want %q/%q/%q", st.CertID, st.AgentDID, st.Status, want.CertID, want.AgentDID, want.Status)
			}
			if st.CheckedAt != want.CheckedAt {
				t.Errorf("checkedAt = %d, want %d", st.CheckedAt, want.CheckedAt)
			}
			if st.Sequence() != want.Seq {
				t.Errorf("Sequence() = %d, want %d", st.Sequence(), want.Seq)
			}
			switch {
			case want.Aud == nil && st.Aud != nil:
				t.Errorf("aud = %q, want absent", *st.Aud)
			case want.Aud != nil && (st.Aud == nil || *st.Aud != *want.Aud):
				t.Errorf("aud = %v, want %q", st.Aud, *want.Aud)
			}
			if err := st.Bind(grantBody, grantBody.AgentDID); err != nil {
				t.Errorf("Bind to the paired grant: %v", err)
			}
		})
	}
}
