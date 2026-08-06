package authz

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// vectorsPath is the shared TS/Go contract, deliberately outside this Go
// module: it belongs to neither implementation (docs/PROXY_ARCHITECTURE.md §3.3).
const vectorsPath = "../../../conformance/permission-vectors.json"

type vectorExpectation struct {
	Allowed        bool   `json:"allowed"`
	GrantingCertID string `json:"grantingCertId"`
	Reason         string `json:"reason"`
}

type vectorCase struct {
	Name   string            `json:"name"`
	Now    int64             `json:"now"`
	Action RequestedAction   `json:"action"`
	Certs  []Certificate     `json:"certs"`
	Expect vectorExpectation `json:"expect"`
}

type vectorFile struct {
	Version int          `json:"version"`
	Cases   []vectorCase `json:"cases"`
}

// TestConformanceVectors is the release gate described in §3.3: every case
// must produce an identical decision here and in
// packages/trust/__tests__/conformance.test.ts. A failure is never fixed by
// editing the vector — it means the two implementations disagree about who may
// do what.
func TestConformanceVectors(t *testing.T) {
	raw, err := os.ReadFile(filepath.Clean(vectorsPath))
	if err != nil {
		t.Fatalf("reading %s: %v (the shared vector file must exist — a skipped conformance suite is a silent regression)", vectorsPath, err)
	}

	var vf vectorFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatalf("parsing %s: %v", vectorsPath, err)
	}

	// Guard against a broken path or a truncated file quietly turning this
	// into a no-op suite that reports success.
	if len(vf.Cases) == 0 {
		t.Fatalf("%s contained no cases", vectorsPath)
	}

	for _, tc := range vf.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			got := Resolve(tc.Action, tc.Certs, tc.Now)

			if got.Allowed != tc.Expect.Allowed {
				t.Fatalf("allowed = %v, want %v (reason: %q)", got.Allowed, tc.Expect.Allowed, got.Reason)
			}
			if got.GrantingCertID != tc.Expect.GrantingCertID {
				t.Errorf("grantingCertId = %q, want %q", got.GrantingCertID, tc.Expect.GrantingCertID)
			}
			if got.Reason != tc.Expect.Reason {
				t.Errorf("reason = %q, want %q", got.Reason, tc.Expect.Reason)
			}
		})
	}
}

// TestResolveDeniesOnEmptyCertificateSet covers the fail-closed default
// directly, rather than relying on a vector: a principal holding nothing must
// never be authorized, whatever the action looks like.
func TestResolveDeniesOnEmptyCertificateSet(t *testing.T) {
	for _, action := range []RequestedAction{
		{Capability: CapInternetAccess},
		{Capability: CapInternetAccess, Resource: Res("api.openai.com:443")},
		{Capability: ""},
	} {
		if d := Resolve(action, nil, 0); d.Allowed {
			t.Errorf("Resolve(%+v, nil) allowed the action", action)
		}
	}
}
