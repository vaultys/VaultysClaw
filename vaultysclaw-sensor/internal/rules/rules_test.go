package rules

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"testing"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
	"github.com/vmihailenco/msgpack/v5"
)

func signSet(t *testing.T, vid *vaultysid.VaultysID, set Set) string {
	t.Helper()
	raw, err := msgpack.Marshal(set)
	if err != nil {
		t.Fatalf("marshalling set: %v", err)
	}
	sig, err := vid.SignChallenge(raw)
	if err != nil {
		t.Fatalf("signing set: %v", err)
	}
	lenBuf := make([]byte, 4)
	binary.LittleEndian.PutUint32(lenBuf, uint32(len(raw)))
	return base64.StdEncoding.EncodeToString(append(append(lenBuf, raw...), sig...))
}

func TestMatchHostIsExactOrHierarchicalOnly(t *testing.T) {
	cases := []struct {
		pattern, host string
		want          bool
		why           string
	}{
		{"api.openai.com", "api.openai.com", true, "exact"},
		{"API.OpenAI.com", "api.openai.com", true, "case-insensitive"},
		{"api.openai.com", "api.openai.com.", true, "trailing root dot is ignored"},
		{"api.openai.com", "openai.com", false, "a parent domain is not the host"},

		// The two bypasses that make substring matching unusable for
		// enforcement. Both must be false.
		{"api.openai.com", "api.openai.com.evil.example", false, "suffix-appended attacker domain must not match an allow rule"},
		{"openai.com", "notopenai.com", false, "prefix-extended domain must not match a deny rule"},
		{"openai.com", "myopenai.company.net", false, "incidental substring must not match"},

		{".openai.com", "api.openai.com", true, "dot-prefixed matches a subdomain"},
		{".openai.com", "a.b.openai.com", true, "dot-prefixed matches a deeper subdomain"},
		{".openai.com", "openai.com", false, "dot-prefixed excludes the apex itself"},
		{".openai.com", "api.openai.com.evil.example", false, "dot-prefixed is still a suffix, not a substring"},

		{"", "api.openai.com", false, "empty pattern matches nothing"},
		{"api.openai.com", "", false, "empty host matches nothing"},
		{".", "api.openai.com", false, "a bare dot matches nothing"},
	}

	for _, c := range cases {
		if got := MatchHost(c.pattern, c.host); got != c.want {
			t.Errorf("MatchHost(%q, %q) = %v, want %v — %s", c.pattern, c.host, got, c.want, c.why)
		}
	}
}

func TestDenyOverridesAllowRegardlessOfOrder(t *testing.T) {
	// The rule the user asked for: "block all access to openai.com", whatever
	// the process. It must beat a broad allow both before and after it in the
	// set, or ordering would silently decide the outcome.
	deny := Rule{ID: "deny-openai", Subject: SubjectAny, Hosts: []string{".openai.com", "openai.com"}, Effect: EffectDeny}
	allow := Rule{ID: "allow-all", Subject: SubjectAny, Hosts: []string{".com"}, Effect: EffectAllow}

	for name, set := range map[string]Set{
		"deny first":  {Rules: []Rule{deny, allow}},
		"allow first": {Rules: []Rule{allow, deny}},
	} {
		t.Run(name, func(t *testing.T) {
			out := set.Evaluate(Destination{Host: "api.openai.com", Port: 443}, nil)
			if out.Verdict != VerdictDeny {
				t.Fatalf("verdict = %q, want deny", out.Verdict)
			}
			if out.RuleID != "deny-openai" {
				t.Errorf("ruleId = %q, want deny-openai", out.RuleID)
			}
		})
	}
}

func TestSubjectAnyNeedsNoAttribution(t *testing.T) {
	// The correctness point from §5.2: a destination rule must hold for a
	// process the classifier never identified. Passing nil attribution stands in
	// for exactly that case.
	set := Set{Rules: []Rule{
		{ID: "deny-openai", Subject: SubjectAny, Hosts: []string{".openai.com"}, Effect: EffectDeny},
	}}

	out := set.Evaluate(Destination{Host: "api.openai.com", Port: 443}, nil)
	if out.Verdict != VerdictDeny {
		t.Fatalf("verdict = %q, want deny — a subject:any rule must not depend on classification", out.Verdict)
	}
	if len(out.NeedsSubject) != 0 {
		t.Errorf("NeedsSubject = %v, want empty — no attribution should have been requested", out.NeedsSubject)
	}
}

func TestSubjectAgentIsUndecidableWithoutAttribution(t *testing.T) {
	set := Set{Rules: []Rule{
		{ID: "agents-no-internet", Subject: SubjectAgent, Hosts: []string{".example.com"}, Effect: EffectDeny},
	}}
	dest := Destination{Host: "api.example.com", Port: 443}

	// No attribution: undecidable, and the caller is told so rather than being
	// handed a clean pass.
	out := set.Evaluate(dest, nil)
	if out.Verdict != VerdictGovern {
		t.Errorf("verdict = %q, want govern", out.Verdict)
	}
	if len(out.NeedsSubject) != 1 || out.NeedsSubject[0] != SubjectAgent {
		t.Fatalf("NeedsSubject = %v, want [agent]", out.NeedsSubject)
	}

	// A governed agent: the rule applies.
	if out := set.Evaluate(dest, &Attribution{IsGovernedAgent: true}); out.Verdict != VerdictDeny {
		t.Errorf("governed agent: verdict = %q, want deny", out.Verdict)
	}

	// A process that is not a governed agent: the rule does not apply, and this
	// is decided, not deferred.
	out = set.Evaluate(dest, &Attribution{IsGovernedAgent: false})
	if out.Verdict != VerdictGovern {
		t.Errorf("non-agent: verdict = %q, want govern", out.Verdict)
	}
	if len(out.NeedsSubject) != 0 {
		t.Errorf("non-agent: NeedsSubject = %v, want empty — the subject was resolved", out.NeedsSubject)
	}
}

func TestDetectedButNotGovernedIsNotEnforcedAgainst(t *testing.T) {
	// §5.2.2: a workload the classifier flagged but an admin has not put in
	// scope still passes. Enforcement is opt-in per workload, never a side
	// effect of a classifier firing.
	set := Set{Rules: []Rule{
		{ID: "agents-no-internet", Subject: SubjectAgent, Hosts: []string{".example.com"}, Effect: EffectDeny},
	}}

	out := set.Evaluate(Destination{Host: "api.example.com", Port: 443}, &Attribution{IsGovernedAgent: false})
	if out.Verdict == VerdictDeny {
		t.Error("a merely-detected workload was enforced against")
	}
}

func TestSubjectWorkloadTargetsOneWorkload(t *testing.T) {
	set := Set{Rules: []Rule{
		{ID: "claude-github-only", Subject: SubjectWorkload, WorkloadID: "wl-claude", Hosts: []string{".internal.example"}, Effect: EffectDeny},
	}}
	dest := Destination{Host: "db.internal.example", Port: 443}

	if out := set.Evaluate(dest, &Attribution{IsGovernedAgent: true, WorkloadID: "wl-claude"}); out.Verdict != VerdictDeny {
		t.Errorf("matching workload: verdict = %q, want deny", out.Verdict)
	}
	if out := set.Evaluate(dest, &Attribution{IsGovernedAgent: true, WorkloadID: "wl-other"}); out.Verdict != VerdictGovern {
		t.Errorf("other workload: verdict = %q, want govern", out.Verdict)
	}
}

func TestPortsRestrictAMatch(t *testing.T) {
	set := Set{Rules: []Rule{
		{ID: "deny-443", Subject: SubjectAny, Hosts: []string{"api.example.com"}, Ports: []int{443}, Effect: EffectDeny},
	}}

	if out := set.Evaluate(Destination{Host: "api.example.com", Port: 443}, nil); out.Verdict != VerdictDeny {
		t.Errorf("port 443: verdict = %q, want deny", out.Verdict)
	}
	if out := set.Evaluate(Destination{Host: "api.example.com", Port: 8080}, nil); out.Verdict != VerdictGovern {
		t.Errorf("port 8080: verdict = %q, want govern", out.Verdict)
	}
}

func TestUnmatchedDestinationIsReferredToTheCertificate(t *testing.T) {
	set := Set{Rules: []Rule{
		{ID: "deny-openai", Subject: SubjectAny, Hosts: []string{".openai.com"}, Effect: EffectDeny},
	}}

	out := set.Evaluate(Destination{Host: "api.github.com", Port: 443}, nil)
	if out.Verdict != VerdictGovern {
		t.Fatalf("verdict = %q, want govern", out.Verdict)
	}
	if out.RuleID != "" {
		t.Errorf("ruleId = %q, want empty", out.RuleID)
	}
}

func TestEmptyRuleSetGovernsEverything(t *testing.T) {
	set := Set{}
	if out := set.Evaluate(Destination{Host: "anything.example", Port: 443}, nil); out.Verdict != VerdictGovern {
		t.Errorf("verdict = %q, want govern — an empty set must not decide anything itself", out.Verdict)
	}
}

func TestVerifySetRoundTrip(t *testing.T) {
	server, _ := vaultysid.GenerateMachine()
	want := Set{
		Version:  1,
		IssuedAt: 1700000000000,
		Rules: []Rule{
			{ID: "r1", Subject: SubjectAny, Hosts: []string{".openai.com"}, Ports: []int{443}, Effect: EffectDeny},
			{ID: "r2", Subject: SubjectWorkload, WorkloadID: "wl-1", Hosts: []string{"api.github.com"}, Effect: EffectAllow},
		},
	}

	got, err := VerifySet(server, signSet(t, server, want))
	if err != nil {
		t.Fatalf("VerifySet: %v", err)
	}
	if got.Version != 1 || got.IssuedAt != want.IssuedAt || len(got.Rules) != 2 {
		t.Fatalf("set = %+v", got)
	}
	if got.Rules[0].Effect != EffectDeny || got.Rules[0].Hosts[0] != ".openai.com" || got.Rules[0].Ports[0] != 443 {
		t.Errorf("rule 0 = %+v", got.Rules[0])
	}
	if got.Rules[1].Subject != SubjectWorkload || got.Rules[1].WorkloadID != "wl-1" {
		t.Errorf("rule 1 = %+v", got.Rules[1])
	}
}

func TestVerifySetRejectsAnUnsignedOrForgedSet(t *testing.T) {
	server, _ := vaultysid.GenerateMachine()
	attacker, _ := vaultysid.GenerateMachine()

	// The §5.2.0 property: rules are a policy source, so a set the control plane
	// did not sign must not be usable. An attacker who can write local config
	// cannot lift a deny rule.
	forged := Set{Rules: []Rule{{ID: "r1", Subject: SubjectAny, Hosts: []string{".example.com"}, Effect: EffectAllow}}}
	if _, err := VerifySet(server, signSet(t, attacker, forged)); !errors.Is(err, ErrUnsignedSet) {
		t.Fatalf("err = %v, want ErrUnsignedSet", err)
	}
	if _, err := VerifySet(server, "not-a-token"); !errors.Is(err, ErrUnsignedSet) {
		t.Fatalf("garbage token: err = %v, want ErrUnsignedSet", err)
	}
}

func TestVerifySetRejectsStructurallyInvalidRules(t *testing.T) {
	server, _ := vaultysid.GenerateMachine()

	// An uninterpretable rule is rejected, never skipped: silently dropping a
	// deny rule would widen access.
	for name, set := range map[string]Set{
		"unknown effect":      {Rules: []Rule{{ID: "r", Subject: SubjectAny, Hosts: []string{"a.example"}, Effect: "audit"}}},
		"unknown subject":     {Rules: []Rule{{ID: "r", Subject: "everyone", Hosts: []string{"a.example"}, Effect: EffectDeny}}},
		"workload without id": {Rules: []Rule{{ID: "r", Subject: SubjectWorkload, Hosts: []string{"a.example"}, Effect: EffectDeny}}},
		"no hosts":            {Rules: []Rule{{ID: "r", Subject: SubjectAny, Effect: EffectDeny}}},
		"empty host":          {Rules: []Rule{{ID: "r", Subject: SubjectAny, Hosts: []string{"  "}, Effect: EffectDeny}}},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := VerifySet(server, signSet(t, server, set)); err == nil {
				t.Fatal("VerifySet accepted a structurally invalid rule set")
			}
		})
	}
}

func TestValidateRefusesSubjectRulesWhenAttributionIsUnavailable(t *testing.T) {
	// §5.2.3 / phase 1a: in explicit mode there is no attribution source. An
	// admin who wrote subject:agent rules there must be told at load time, not
	// silently fail open on every request.
	withSubjects := Set{Rules: []Rule{
		{ID: "r1", Subject: SubjectAgent, Hosts: []string{".example.com"}, Effect: EffectDeny},
	}}
	if err := withSubjects.Validate(false); !errors.Is(err, ErrAttributionUnavailable) {
		t.Fatalf("err = %v, want ErrAttributionUnavailable", err)
	}
	if err := withSubjects.Validate(true); err != nil {
		t.Errorf("with attribution available: %v", err)
	}

	anyOnly := Set{Rules: []Rule{
		{ID: "r1", Subject: SubjectAny, Hosts: []string{".example.com"}, Effect: EffectDeny},
	}}
	if err := anyOnly.Validate(false); err != nil {
		t.Errorf("subject:any without attribution must be fine: %v", err)
	}
}
