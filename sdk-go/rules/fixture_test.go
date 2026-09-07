package rules

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
)

// fixturePath holds a rule set signed by the *TypeScript* control plane
// (packages/controlplane/lib/proxy-rules.ts). Regenerate with:
//
//	pnpm tsx conformance/generate-rules-fixture.ts
//
// This is the higher-risk of the two conformance fixtures. The capability-grant
// format pre-existed this feature; the rule-set format was invented for it, so
// nothing else in either test suite would catch a disagreement about msgpack key
// names or the subject/effect vocabularies. A field this side decodes to a zero
// value is a rule that silently does not apply — and a `deny` rule that does not
// apply is an enforcement failure with no error anywhere
// (docs/PROXY_ARCHITECTURE.md §3.3).
const fixturePath = "../../conformance/rules-fixture.json"

type rulesFixture struct {
	ServerIDBase64 string `json:"serverIdBase64"`
	ServerDID      string `json:"serverDid"`
	Token          string `json:"token"`
	ExpectedSet    struct {
		Version  int   `json:"version"`
		IssuedAt int64 `json:"issuedAt"`
		Rules    []struct {
			ID         string   `json:"id"`
			Subject    string   `json:"subject"`
			WorkloadID string   `json:"workloadId"`
			Hosts      []string `json:"hosts"`
			Ports      []int    `json:"ports"`
			Effect     string   `json:"effect"`
		} `json:"rules"`
		ResourceRules []struct {
			ID         string   `json:"id"`
			Subject    string   `json:"subject"`
			WorkloadID string   `json:"workloadId"`
			Resources  []string `json:"resources"`
			Effect     string   `json:"effect"`
		} `json:"resourceRules"`
	} `json:"expectedSet"`
}

func loadRulesFixture(t *testing.T) rulesFixture {
	t.Helper()
	raw, err := os.ReadFile(filepath.Clean(fixturePath))
	if err != nil {
		t.Fatalf("reading %s: %v (regenerate with: pnpm tsx conformance/generate-rules-fixture.ts)", fixturePath, err)
	}
	var f rulesFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("parsing %s: %v", fixturePath, err)
	}
	if f.Token == "" || len(f.ExpectedSet.Rules) == 0 || len(f.ExpectedSet.ResourceRules) == 0 {
		t.Fatalf("%s has no token, no host rules, or no resource rules — a fixture missing half the wire format pins half the contract", fixturePath)
	}
	return f
}

func TestVerifiesARuleSetSignedByTypeScript(t *testing.T) {
	f := loadRulesFixture(t)

	rawID, err := base64.StdEncoding.DecodeString(f.ServerIDBase64)
	if err != nil {
		t.Fatalf("decoding server id: %v", err)
	}
	serverID, err := vaultysid.FromID(rawID, nil)
	if err != nil {
		t.Fatalf("reconstructing the signer's identity: %v", err)
	}
	if got := serverID.DID(); got != f.ServerDID {
		t.Errorf("DID = %q, want %q", got, f.ServerDID)
	}

	set, err := VerifySet(serverID, f.Token)
	if err != nil {
		t.Fatalf("VerifySet on a TypeScript-signed rule set: %v", err)
	}

	if set.Version != f.ExpectedSet.Version {
		t.Errorf("version = %d, want %d", set.Version, f.ExpectedSet.Version)
	}
	if set.IssuedAt != f.ExpectedSet.IssuedAt {
		t.Errorf("issuedAt = %d, want %d (a mismatch means the number encoding differs)", set.IssuedAt, f.ExpectedSet.IssuedAt)
	}
	if len(set.Rules) != len(f.ExpectedSet.Rules) {
		t.Fatalf("decoded %d rules, want %d", len(set.Rules), len(f.ExpectedSet.Rules))
	}

	for i, want := range f.ExpectedSet.Rules {
		got := set.Rules[i]
		if got.ID != want.ID {
			t.Errorf("rule %d: id = %q, want %q", i, got.ID, want.ID)
		}
		if string(got.Subject) != want.Subject {
			t.Errorf("rule %d (%s): subject = %q, want %q", i, want.ID, got.Subject, want.Subject)
		}
		if string(got.Effect) != want.Effect {
			t.Errorf("rule %d (%s): effect = %q, want %q — a dropped effect would change what the rule does", i, want.ID, got.Effect, want.Effect)
		}
		if got.WorkloadID != want.WorkloadID {
			t.Errorf("rule %d (%s): workloadId = %q, want %q", i, want.ID, got.WorkloadID, want.WorkloadID)
		}
		if len(got.Hosts) != len(want.Hosts) {
			t.Errorf("rule %d (%s): hosts = %v, want %v", i, want.ID, got.Hosts, want.Hosts)
		} else {
			for j := range want.Hosts {
				if got.Hosts[j] != want.Hosts[j] {
					t.Errorf("rule %d (%s): hosts[%d] = %q, want %q", i, want.ID, j, got.Hosts[j], want.Hosts[j])
				}
			}
		}
		if len(got.Ports) != len(want.Ports) {
			t.Errorf("rule %d (%s): ports = %v, want %v", i, want.ID, got.Ports, want.Ports)
		} else {
			for j := range want.Ports {
				if got.Ports[j] != want.Ports[j] {
					t.Errorf("rule %d (%s): ports[%d] = %d, want %d", i, want.ID, j, got.Ports[j], want.Ports[j])
				}
			}
		}
	}

	if len(set.ResourceRules) != len(f.ExpectedSet.ResourceRules) {
		t.Fatalf("decoded %d resource rules, want %d", len(set.ResourceRules), len(f.ExpectedSet.ResourceRules))
	}
	for i, want := range f.ExpectedSet.ResourceRules {
		got := set.ResourceRules[i]
		if got.ID != want.ID {
			t.Errorf("resource rule %d: id = %q, want %q", i, got.ID, want.ID)
		}
		if string(got.Subject) != want.Subject {
			t.Errorf("resource rule %d (%s): subject = %q, want %q", i, want.ID, got.Subject, want.Subject)
		}
		if string(got.Effect) != want.Effect {
			t.Errorf("resource rule %d (%s): effect = %q, want %q", i, want.ID, got.Effect, want.Effect)
		}
		if got.WorkloadID != want.WorkloadID {
			t.Errorf("resource rule %d (%s): workloadId = %q, want %q", i, want.ID, got.WorkloadID, want.WorkloadID)
		}
		if len(got.Resources) != len(want.Resources) {
			t.Errorf("resource rule %d (%s): resources = %v, want %v", i, want.ID, got.Resources, want.Resources)
		} else {
			for j := range want.Resources {
				if got.Resources[j] != want.Resources[j] {
					t.Errorf("resource rule %d (%s): resources[%d] = %q, want %q", i, want.ID, j, got.Resources[j], want.Resources[j])
				}
			}
		}
	}
}

// TestTypeScriptRuleSetResourceRulesDecideAsAuthored is the resource half of
// the loop below: decoding the fields is necessary but not sufficient, and the
// wildcard semantics are exactly where two implementations drift.
func TestTypeScriptRuleSetResourceRulesDecideAsAuthored(t *testing.T) {
	f := loadRulesFixture(t)
	rawID, _ := base64.StdEncoding.DecodeString(f.ServerIDBase64)
	serverID, err := vaultysid.FromID(rawID, nil)
	if err != nil {
		t.Fatalf("FromID: %v", err)
	}
	set, err := VerifySet(serverID, f.Token)
	if err != nil {
		t.Fatalf("VerifySet: %v", err)
	}

	agent := &Attribution{IsGovernedAgent: true}
	claude := &Attribution{IsGovernedAgent: true, WorkloadID: "wl-claude-code"}

	cases := []struct {
		name        string
		resource    string
		attribution *Attribution
		want        Verdict
		wantRule    string
	}{
		{"a key under the denied subtree", "file:///Users/fx/.ssh/id_ed25519", nil, VerdictDeny, "deny-ssh-keys"},
		{"the denied subtree itself", "file:///Users/fx/.ssh", nil, VerdictDeny, "deny-ssh-keys"},
		{"an exact denied file", "file:///Users/fx/.netrc", nil, VerdictDeny, "deny-ssh-keys"},
		{"a sibling of the subtree is NOT denied — the wildcard cuts at the separator",
			"file:///Users/fx/.sshfoo/key", nil, VerdictGovern, ""},
		{"an unrelated path is left to the certificate", "file:///Users/fx/repo/main.go", nil, VerdictGovern, ""},
		{"an exec deny needs attribution and gets it", "exec://docker", agent, VerdictDeny, "agents-no-docker"},
		{"the same exec call from an unattributed caller is undecidable, not allowed",
			"exec://docker", nil, VerdictGovern, ""},
		{"a workload-scoped allow matches its workload", "file:///Users/fx/repo/main.go", claude, VerdictAllow, "claude-may-write-the-repo"},
		{"and not another one", "file:///Users/fx/repo/main.go", agent, VerdictGovern, ""},
		{"a host rule never decides a resource", "file:///openai.com", nil, VerdictGovern, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := set.EvaluateResource(tc.resource, tc.attribution)
			if out.Verdict != tc.want {
				t.Errorf("verdict = %q, want %q", out.Verdict, tc.want)
			}
			if out.RuleID != tc.wantRule {
				t.Errorf("ruleId = %q, want %q", out.RuleID, tc.wantRule)
			}
		})
	}
}

// TestTypeScriptRuleSetDecidesAsAuthored closes the loop: decoding the fields
// correctly is necessary but not sufficient — the decoded set has to actually
// produce the verdicts the author intended.
func TestTypeScriptRuleSetDecidesAsAuthored(t *testing.T) {
	f := loadRulesFixture(t)
	rawID, _ := base64.StdEncoding.DecodeString(f.ServerIDBase64)
	serverID, err := vaultysid.FromID(rawID, nil)
	if err != nil {
		t.Fatalf("FromID: %v", err)
	}
	set, err := VerifySet(serverID, f.Token)
	if err != nil {
		t.Fatalf("VerifySet: %v", err)
	}

	cases := []struct {
		name        string
		dest        Destination
		attribution *Attribution
		want        Verdict
	}{
		{"subject:any deny needs no attribution", Destination{Host: "api.openai.com", Port: 443}, nil, VerdictDeny},
		{"the apex is covered by its own entry", Destination{Host: "openai.com", Port: 443}, nil, VerdictDeny},
		{"an unrelated host falls through to the certificate", Destination{Host: "example.org", Port: 443}, nil, VerdictGovern},
		{
			"subject:agent deny applies to a governed agent",
			Destination{Host: "db.internal.example", Port: 443},
			&Attribution{IsGovernedAgent: true},
			VerdictDeny,
		},
		{
			"subject:agent deny does not apply on a non-agent",
			Destination{Host: "db.internal.example", Port: 443},
			&Attribution{IsGovernedAgent: false},
			VerdictGovern,
		},
		{
			"the ports restriction survived the round trip",
			Destination{Host: "db.internal.example", Port: 9999},
			&Attribution{IsGovernedAgent: true},
			VerdictGovern,
		},
		{
			"subject:workload allow matches its workload",
			Destination{Host: "api.github.com", Port: 443},
			&Attribution{IsGovernedAgent: true, WorkloadID: "wl-claude-code"},
			VerdictAllow,
		},
		{
			"subject:workload allow does not match another workload",
			Destination{Host: "api.github.com", Port: 443},
			&Attribution{IsGovernedAgent: true, WorkloadID: "wl-other"},
			VerdictGovern,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := set.Evaluate(c.dest, c.attribution); got.Verdict != c.want {
				t.Errorf("verdict = %q, want %q (rule %q)", got.Verdict, c.want, got.RuleID)
			}
		})
	}
}
