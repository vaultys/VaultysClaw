package supervise

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
	"github.com/vaultys/VaultysClaw/sdk-go/rules"
)

var now = time.Date(2026, 9, 3, 12, 0, 0, 0, time.UTC)

// cert builds a usable certificate scoped to pattern (empty = unscoped).
func cert(id string, pattern string, caps ...authz.Capability) authz.Certificate {
	c := authz.Certificate{
		ID:           id,
		AgentDID:     "did:vaultys:test",
		Capabilities: caps,
		Status:       authz.StatusActive,
		IssuedAt:     now.Add(-time.Hour).UnixMilli(),
	}
	if pattern != "" {
		c.Scope = &authz.CertScope{ResourcePattern: pattern}
	}
	return c
}

func baseConfig(mode Mode, floor *Floor, certs ...authz.Certificate) Config {
	return Config{
		Mode:         mode,
		Certs:        certs,
		Floor:        floor,
		MaxStatusAge: time.Hour,
		SyncedAt:     now.Add(-time.Minute),
		FailClosed:   true,
	}
}

func mapCall(t *testing.T, tool, input, cwd string) (Action, error) {
	t.Helper()
	return MapToolCall(tool, json.RawMessage(input), cwd)
}

// The demo from docs/HARNESS_SUPERVISOR.md §5: one grant, five calls, and a
// *distinct reason per outcome* — which is the stated acceptance criterion,
// because a governance decision nobody can explain afterwards is not worth
// taking.
func TestDecideDemo(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	repo := filepath.Join(home, "repo")
	ssh := filepath.Join(home, ".ssh")
	for _, d := range []string{repo, ssh, filepath.Join(home, "other")} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	resolvedHome, _ := filepath.EvalSymlinks(home)
	resolvedRepo := filepath.Join(resolvedHome, "repo")

	floor := NewFloor([]string{"~/.ssh"})
	certs := []authz.Certificate{
		cert("cert-repo", FileURI(resolvedRepo)+"/*", CapFileRead, CapFileWrite),
		cert("cert-exec", "", CapCodeExecution),
	}
	cfg := baseConfig(ModeExplicit, floor, certs...)

	tests := []struct {
		name        string
		tool, input string
		wantAllowed bool
		wantReason  string // substring
		wantCert    string
	}{
		{
			name: "1. edit in the repo is allowed by the certificate",
			tool: "Edit", input: `{"file_path":"` + repo + `/main.go"}`,
			wantAllowed: true, wantReason: "allowed by certificate", wantCert: "cert-repo",
		},
		{
			name: "2. reading a private key is refused by the safety floor",
			tool: "Read", input: `{"file_path":"` + ssh + `/id_ed25519"}`,
			wantAllowed: false, wantReason: "on the safety floor",
		},
		{
			name: "3. reading outside the scope is refused by the certificate — a different reason from (2)",
			tool: "Read", input: `{"file_path":"` + home + `/other/x"}`,
			wantAllowed: false, wantReason: "No active certificate grants 'file_read'",
		},
		{
			name: "4. git status is allowed by the unscoped code_execution grant",
			tool: "Bash", input: `{"command":"git status"}`,
			wantAllowed: true, wantReason: "allowed by certificate", wantCert: "cert-exec",
		},
	}

	seen := map[string]string{}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			action, err := mapCall(t, tc.tool, tc.input, repo)
			out := Decide(cfg, action, err, now)
			if out.Allowed != tc.wantAllowed {
				t.Errorf("allowed = %v, want %v (reason: %s)", out.Allowed, tc.wantAllowed, out.Reason)
			}
			if !strings.Contains(out.Reason, tc.wantReason) {
				t.Errorf("reason = %q, want it to contain %q", out.Reason, tc.wantReason)
			}
			if tc.wantCert != "" && out.GrantingCertID != tc.wantCert {
				t.Errorf("grantingCertId = %q, want %q", out.GrantingCertID, tc.wantCert)
			}
			if prev, dup := seen[out.Reason]; dup {
				t.Errorf("reason %q is identical to the one for %q — every outcome must be distinguishable from the log alone", out.Reason, prev)
			}
			seen[out.Reason] = tc.name
		})
	}

	// 5. curl is *allowed* at tier A, because code_execution is held. The plan
	// says so explicitly, and this test exists to keep that honest: tier A does
	// not govern what a shell child does, tiers B and C do.
	t.Run("5. curl passes tier A — the gap tier B and C exist to close", func(t *testing.T) {
		action, err := mapCall(t, "Bash", `{"command":"curl https://example.com"}`, repo)
		out := Decide(cfg, action, err, now)
		if !out.Allowed {
			t.Fatalf("expected tier A to allow curl under code_execution; got %q", out.Reason)
		}
	})
}

// 6. The same grant in observe mode: everything proceeds, and the spool still
// carries what would have happened.
func TestObserveModeAllowsButRecordsTheCounterfactual(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	ssh := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(ssh, 0o755); err != nil {
		t.Fatal(err)
	}

	cfg := baseConfig(ModeObserve, NewFloor([]string{"~/.ssh"}))
	action, err := mapCall(t, "Read", `{"file_path":"`+ssh+`/id_ed25519"}`, home)
	out := Decide(cfg, action, err, now)

	if !out.Allowed {
		t.Error("observe mode must never refuse — it exists to learn the resource grammar, not to enforce")
	}
	if !out.WouldDeny {
		t.Error("WouldDeny must record that explicit mode would have refused this, or the spool proves nothing")
	}
	if !strings.Contains(out.Reason, "safety floor") {
		t.Errorf("the reason must survive into observe mode; got %q", out.Reason)
	}
}

func TestFloorIsNotOverridableByACertificate(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	ssh := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(ssh, 0o755); err != nil {
		t.Fatal(err)
	}

	// An unscoped file_read grant authorizes every path there is. The floor
	// still refuses, which is the entire reason it is checked first.
	cfg := baseConfig(ModeExplicit, NewFloor([]string{"~/.ssh"}), cert("cert-all", "", CapFileRead))
	action, err := mapCall(t, "Read", `{"file_path":"`+ssh+`/id_ed25519"}`, home)
	out := Decide(cfg, action, err, now)

	if out.Allowed {
		t.Fatal("an unscoped grant must not override the safety floor")
	}
	if out.GrantingCertID != "" {
		t.Errorf("no certificate should be credited for a floor refusal; got %q", out.GrantingCertID)
	}
}

func TestUnmappedToolPassesInBothModes(t *testing.T) {
	// Explicit mode must not start refusing tools merely because the mapping
	// table has not caught up: that is enforcement by ignorance, not policy.
	for _, mode := range []Mode{ModeObserve, ModeExplicit} {
		cfg := baseConfig(mode, nil)
		action, err := mapCall(t, "SomeFutureTool", `{}`, "/tmp")
		if !errors.Is(err, ErrUnmapped) {
			t.Fatalf("expected ErrUnmapped, got %v", err)
		}
		out := Decide(cfg, action, err, now)
		if !out.Allowed {
			t.Errorf("mode %s: an unmapped tool must pass; got %q", mode, out.Reason)
		}
		if !out.Unmapped {
			t.Errorf("mode %s: the coverage gap must be countable, not silent", mode)
		}
		if out.WouldDeny {
			t.Errorf("mode %s: an unmapped tool is the absence of a judgement, not a denial", mode)
		}
	}
}

func TestMalformedCallFailsClosed(t *testing.T) {
	// A call whose target cannot be determined cannot be checked against a
	// scope, so it must not be treated like an unmapped tool.
	cfg := baseConfig(ModeExplicit, nil, cert("cert-all", "", CapFileRead))
	action, err := mapCall(t, "Read", `{}`, "/tmp")
	out := Decide(cfg, action, err, now)
	if out.Allowed {
		t.Fatal("a Read with no path must be refused, not passed as ungoverned")
	}
	if out.Unmapped {
		t.Error("a malformed call is not an unmapped tool — conflating them hides a real gap behind a fake one")
	}
}

func TestStaleness(t *testing.T) {
	certs := []authz.Certificate{cert("cert-all", "", CapFileRead)}
	action, err := mapCall(t, "Read", `{"file_path":"/tmp/x"}`, "/tmp")
	if err != nil {
		t.Fatal(err)
	}

	t.Run("zero maxStatusAge is the strictest setting, not the loosest", func(t *testing.T) {
		cfg := baseConfig(ModeExplicit, nil, certs...)
		cfg.MaxStatusAge = 0
		out := Decide(cfg, action, nil, now)
		if out.Allowed {
			t.Fatal("maxStatusAge 0 with failClosed must deny — it means no cached status is acceptable")
		}
		if !strings.Contains(out.Reason, "maxStatusAgeSeconds is 0") {
			t.Errorf("the reason must explain the setting, not just say denied; got %q", out.Reason)
		}
	})

	t.Run("negative maxStatusAge is unbounded", func(t *testing.T) {
		cfg := baseConfig(ModeExplicit, nil, certs...)
		cfg.MaxStatusAge = -1
		cfg.SyncedAt = now.Add(-10000 * time.Hour)
		if out := Decide(cfg, action, nil, now); !out.Allowed {
			t.Fatalf("negative maxStatusAge must not expire; got %q", out.Reason)
		}
	})

	t.Run("stale with failClosed=false continues, and says so in every record", func(t *testing.T) {
		cfg := baseConfig(ModeExplicit, nil, certs...)
		cfg.SyncedAt = now.Add(-10 * time.Hour)
		cfg.FailClosed = false
		out := Decide(cfg, action, nil, now)
		if !out.Allowed {
			t.Fatalf("failClosed=false must continue on the stale set; got %q", out.Reason)
		}
		if !strings.Contains(out.Reason, "failClosed=false") {
			t.Errorf("a decision taken on stale status must say so in its own record, not only at startup; got %q", out.Reason)
		}
	})
}

func TestFloorMatchesBySegmentNotByPrefix(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	for _, d := range []string{".ssh", ".sshfoo"} {
		if err := os.MkdirAll(filepath.Join(home, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	resolvedHome, _ := filepath.EvalSymlinks(home)
	floor := NewFloor([]string{"~/.ssh"})

	if refused, _ := floor.Refuses(filepath.Join(resolvedHome, ".ssh", "id")); !refused {
		t.Error("a path beneath a floor entry must be refused")
	}
	if refused, _ := floor.Refuses(filepath.Join(resolvedHome, ".ssh")); !refused {
		t.Error("the floor entry itself must be refused")
	}
	if refused, _ := floor.Refuses(filepath.Join(resolvedHome, ".sshfoo", "x")); refused {
		t.Error(".sshfoo is not beneath .ssh — a string-prefix match would wrongly refuse it")
	}
}

func TestFloorNamesWhatItRefused(t *testing.T) {
	// An operator has to be able to tell "your own grant file" from a generic
	// floor entry, or the denial is unactionable.
	floor := NewFloor(nil, FloorPath{Path: "/etc/vaultys/grant.token", Reason: "this supervisor's own capability grant"})
	refused, why := floor.Refuses("/etc/vaultys/grant.token")
	if !refused {
		t.Fatal("an extra floor path must be refused")
	}
	if !strings.Contains(why, "own capability grant") {
		t.Errorf("reason = %q, want the caller's own explanation", why)
	}
}

// ruleSet builds an unsigned set for testing the decision logic. Verification is
// rules.VerifySet's job and is covered by the conformance fixture; what matters
// here is precedence.
func ruleSet(rs ...rules.ResourceRule) *rules.Set {
	return &rules.Set{Version: 1, ResourceRules: rs}
}

func TestSignedRulesTakePrecedenceOverTheFloor(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	aws := filepath.Join(home, ".aws")
	if err := os.MkdirAll(aws, 0o755); err != nil {
		t.Fatal(err)
	}
	resolvedHome, _ := filepath.EvalSymlinks(home)
	credentials := filepath.Join(resolvedHome, ".aws", "credentials")

	cfg := baseConfig(ModeExplicit, NewFloor([]string{"~/.aws"}), cert("c", "", CapFileRead))

	// Without a rule, the floor refuses.
	action, err := mapCall(t, "Read", `{"file_path":"`+filepath.Join(aws, "credentials")+`"}`, home)
	if out := Decide(cfg, action, err, now); out.Allowed {
		t.Fatal("the floor must refuse when no signed rule covers the path")
	}

	// An admin who deliberately signed an allow for it gets it. Unsigned local
	// config must not be able to overrule a signed decision — in either
	// direction.
	cfg.Rules = ruleSet(rules.ResourceRule{
		ID: "ops-may-read-aws", Subject: rules.SubjectAny,
		Resources: []string{FileURI(credentials)}, Effect: rules.EffectAllow,
	})
	out := Decide(cfg, action, err, now)
	if !out.Allowed {
		t.Fatalf("a signed allow must override the floor; got %q", out.Reason)
	}
	if out.RuleID != "ops-may-read-aws" {
		t.Errorf("ruleId = %q, want the signed rule credited, not the floor", out.RuleID)
	}
	if out.FloorRefused {
		t.Error("a call settled by a signed rule must not be recorded as a floor refusal")
	}
}

func TestFloorStillAppliesWhenNoRuleMatches(t *testing.T) {
	// The case that is every deployment today: a rule set exists but says
	// nothing about this path. A supervisor whose only deny source is policy
	// nobody wrote yet protects nothing.
	home := t.TempDir()
	t.Setenv("HOME", home)
	ssh := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(ssh, 0o755); err != nil {
		t.Fatal(err)
	}

	cfg := baseConfig(ModeExplicit, NewFloor([]string{"~/.ssh"}), cert("c", "", CapFileRead))
	cfg.Rules = ruleSet(rules.ResourceRule{
		ID: "unrelated", Subject: rules.SubjectAny,
		Resources: []string{"file:///somewhere/else/*"}, Effect: rules.EffectDeny,
	})

	action, err := mapCall(t, "Read", `{"file_path":"`+filepath.Join(ssh, "id")+`"}`, home)
	out := Decide(cfg, action, err, now)
	if out.Allowed {
		t.Fatal("the floor must still refuse a path no rule matched")
	}
	if !out.FloorRefused {
		t.Error("the refusal must be attributed to the floor, not to a rule that did not fire")
	}
}

func TestASignedDenyBeatsAnUnscopedCertificate(t *testing.T) {
	// The property that makes a rule set worth signing: a deny that no grant can
	// override, expressible for a filesystem resource — which is exactly what
	// rules.Rule's host/port shape could not do.
	cfg := baseConfig(ModeExplicit, nil, cert("c", "", CapFileRead))
	// The pattern is the *resolved* path, and on macOS that is /private/etc —
	// a rule written as "file:///etc/*" silently matches nothing there, because
	// the supervisor canonicalizes every path before comparing (which is what
	// stops "../" and symlink escapes). This is the authoring trap
	// proxyResourceRuleWarnings warns about; the test spells it out rather than
	// hiding it behind a fixture.
	etc, err := ResolvePath("/etc", "")
	if err != nil {
		t.Fatal(err)
	}
	cfg.Rules = ruleSet(rules.ResourceRule{
		ID: "no-etc", Subject: rules.SubjectAny,
		Resources: []string{FileURI(etc) + "/*"}, Effect: rules.EffectDeny,
	})
	action, err := mapCall(t, "Read", `{"file_path":"/etc/hosts"}`, "/tmp")
	out := Decide(cfg, action, err, now)
	if out.Allowed {
		t.Fatal("an unscoped grant must not override a signed deny")
	}
	if out.RuleID != "no-etc" {
		t.Errorf("ruleId = %q, want the deny rule named in the record", out.RuleID)
	}
}

func TestAnUnresolvedRulePatternMatchesNothing(t *testing.T) {
	// Documenting the trap as a test, the same way the seatbelt one is: on a
	// host where /etc is a symlink, a rule naming the unresolved form covers
	// nothing at all, silently. Authoring must use the resolved path — which is
	// the form `vaultysclaw-sensor report` prints, so an admin working from the
	// report gets it right by construction.
	if resolved, _ := ResolvePath("/etc", ""); resolved == "/etc" {
		t.Skip("/etc is not behind a symlink on this host; the trap does not reproduce")
	}
	cfg := baseConfig(ModeExplicit, nil, cert("c", "", CapFileRead))
	cfg.Rules = ruleSet(rules.ResourceRule{
		ID: "no-etc", Subject: rules.SubjectAny,
		Resources: []string{"file:///etc/*"}, Effect: rules.EffectDeny,
	})
	action, err := mapCall(t, "Read", `{"file_path":"/etc/hosts"}`, "/tmp")
	if out := Decide(cfg, action, err, now); out.RuleID != "" {
		t.Errorf("the unresolved rule matched %q — the trap has been fixed, update the warning", out.RuleID)
	}
}

func TestExecResourcesAreRuleMatchable(t *testing.T) {
	// The other half of what phase 3 unlocks: "this host may not run docker",
	// which is a destination-shaped policy with no destination.
	cfg := baseConfig(ModeExplicit, nil, cert("c", "", CapCodeExecution))
	cfg.Rules = ruleSet(rules.ResourceRule{
		ID: "no-docker", Subject: rules.SubjectAny,
		Resources: []string{"exec://docker"}, Effect: rules.EffectDeny,
	})
	action, err := mapCall(t, "Bash", `{"command":"docker run --privileged x"}`, "/tmp")
	if out := Decide(cfg, action, err, now); out.Allowed {
		t.Fatal("a signed exec deny must refuse")
	}
	action, err = mapCall(t, "Bash", `{"command":"git status"}`, "/tmp")
	if out := Decide(cfg, action, err, now); !out.Allowed {
		t.Fatal("an unrelated command must still be decided by the certificate")
	}
}

func TestNoResourceToolIsNotCountedAsAGap(t *testing.T) {
	// Two kinds of pass, and the difference is the whole point: one is backlog,
	// the other never will be. A coverage metric that adds them together
	// measures nothing.
	for _, mode := range []Mode{ModeObserve, ModeExplicit} {
		cfg := baseConfig(mode, nil)
		action, err := mapCall(t, "TodoWrite", `{}`, "/tmp")
		out := Decide(cfg, action, err, now)
		if !out.Allowed {
			t.Errorf("mode %s: a tool reaching no resource must pass; got %q", mode, out.Reason)
		}
		if out.Unmapped {
			t.Errorf("mode %s: it must not count as an unclosed coverage gap", mode)
		}
		if !out.NoResource {
			t.Errorf("mode %s: it must be recorded as reaching no resource, not silently", mode)
		}
	}
}

func TestMCPToolsAreGovernedByCertificateScope(t *testing.T) {
	// "The tool list is the certificate" (docs/PROXY_ARCHITECTURE.md §10), now
	// reachable at the tool boundary rather than only behind TLS inspection.
	cfg := baseConfig(ModeExplicit, nil, cert("mcp-github", "mcp://github/*", CapAPICall))

	action, err := mapCall(t, "mcp__github__create_pull_request", `{}`, "/tmp")
	if out := Decide(cfg, action, err, now); !out.Allowed {
		t.Fatalf("an in-scope MCP tool must be allowed; got %q", out.Reason)
	}
	action, err = mapCall(t, "mcp__jira__delete_issue", `{}`, "/tmp")
	out := Decide(cfg, action, err, now)
	if out.Allowed {
		t.Fatal("an MCP tool on another server must not be covered by a github-scoped grant")
	}
	if !strings.Contains(out.Reason, "mcp://jira/delete_issue") {
		t.Errorf("the reason must name the resource the model asked for; got %q", out.Reason)
	}
}

func TestWebFetchIsGovernedByAllowedDomainsStyleScope(t *testing.T) {
	cfg := baseConfig(ModeExplicit, nil, cert("web", "https://docs.example.com/*", CapInternetAccess))

	action, err := mapCall(t, "WebFetch", `{"url":"https://docs.example.com/guide"}`, "/tmp")
	if out := Decide(cfg, action, err, now); !out.Allowed {
		t.Fatalf("an in-scope fetch must be allowed; got %q", out.Reason)
	}
	action, err = mapCall(t, "WebFetch", `{"url":"https://evil.example/exfil"}`, "/tmp")
	if out := Decide(cfg, action, err, now); out.Allowed {
		t.Fatal("a fetch outside the scope must be refused")
	}
}

func TestASignedAllowLiftsAFloorEntry(t *testing.T) {
	// How an admin removes a floor deny without the floor being optional: a
	// signed allow is evaluated before the floor, so it settles the call.
	home := t.TempDir()
	t.Setenv("HOME", home)
	aws := filepath.Join(home, ".aws")
	if err := os.MkdirAll(aws, 0o755); err != nil {
		t.Fatal(err)
	}
	resolvedHome, _ := filepath.EvalSymlinks(home)

	cfg := baseConfig(ModeExplicit, NewFloor([]string{"~/.aws"}), cert("c", "", CapFileRead))
	cfg.Rules = ruleSet(rules.ResourceRule{
		ID: "ops-may-read-aws", Subject: rules.SubjectAny,
		Resources: []string{FileURI(filepath.Join(resolvedHome, ".aws")) + "/*"}, Effect: rules.EffectAllow,
	})

	action, err := mapCall(t, "Read", `{"file_path":"`+filepath.Join(aws, "credentials")+`"}`, home)
	out := Decide(cfg, action, err, now)
	if !out.Allowed {
		t.Fatalf("a signed allow must lift a floor entry; got %q", out.Reason)
	}
	if out.FloorRefused {
		t.Error("the call was settled by a rule, so it must not be recorded as a floor refusal")
	}
}

func TestAddingAnUnrelatedRuleDoesNotDropFloorProtection(t *testing.T) {
	// The regression this design was briefly rewritten into and back out of:
	// making the floor step aside once any rule set exists means adding
	// "deny exec://docker" silently drops the ~/.ssh protection nobody knew they
	// were relying on. Adding policy must never remove protection.
	home := t.TempDir()
	t.Setenv("HOME", home)
	ssh := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(ssh, 0o755); err != nil {
		t.Fatal(err)
	}

	cfg := baseConfig(ModeExplicit, NewFloor([]string{"~/.ssh"}), cert("c", "", CapFileRead))
	cfg.Rules = ruleSet(rules.ResourceRule{
		ID: "no-docker", Subject: rules.SubjectAny,
		Resources: []string{"exec://docker"}, Effect: rules.EffectDeny,
	})

	action, err := mapCall(t, "Read", `{"file_path":"`+filepath.Join(ssh, "id")+`"}`, home)
	out := Decide(cfg, action, err, now)
	if out.Allowed || !out.FloorRefused {
		t.Fatalf("the floor must still refuse; got allowed=%v reason=%q", out.Allowed, out.Reason)
	}
}
