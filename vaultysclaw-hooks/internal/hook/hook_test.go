package hook

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vaultys/vaultysclaw-hooks/internal/audit"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"

	_ "github.com/vaultys/vaultysclaw-hooks/internal/adapter/claudecode"
)

type env struct {
	home  string
	paths state.Paths
}

func newEnv(t *testing.T, mode state.Mode) env {
	t.Helper()
	home, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)
	dir := filepath.Join(home, "state")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	p := state.PathsFor(state.ScopeUser, dir)
	p.Spool = filepath.Join(home, "spool", state.SpoolFile)
	cfg := state.DefaultConfig()
	cfg.Mode = mode
	data, _ := json.Marshal(cfg)
	if err := os.WriteFile(p.Config, data, 0o600); err != nil {
		t.Fatal(err)
	}
	return env{home: home, paths: p}
}

func (e env) run(t *testing.T, event, payload string) (int, string, audit.Record) {
	t.Helper()
	var stdout, stderr strings.Builder
	code := Run(Options{
		Vendor: "claude-code", Event: event, Paths: e.paths,
		Stdin: strings.NewReader(payload), Stdout: &stdout, Stderr: &stderr,
	})
	return code, stdout.String(), e.lastRecord(t)
}

func (e env) lastRecord(t *testing.T) audit.Record {
	t.Helper()
	f, err := os.Open(e.paths.Spool)
	if err != nil {
		t.Fatalf("no spool: %v", err)
	}
	defer f.Close()
	var last audit.Record
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		last = audit.Record{}
		if err := json.Unmarshal(sc.Bytes(), &last); err != nil {
			t.Fatal(err)
		}
	}
	return last
}

func preTool(t *testing.T, cwd, tool string, input map[string]string) string {
	t.Helper()
	b, _ := json.Marshal(map[string]any{
		"session_id": "s1", "cwd": cwd, "hook_event_name": "PreToolUse",
		"tool_name": tool, "tool_input": input,
	})
	return string(b)
}

func TestObserveNeverBlocksButRecords(t *testing.T) {
	e := newEnv(t, state.ModeObserve)
	code, out, rec := e.run(t, "PreToolUse", preTool(t, e.home, "Read", map[string]string{"file_path": filepath.Join(e.home, ".ssh", "id_rsa")}))
	if code != 0 || out != "" {
		t.Fatalf("observe mode must stay silent, got code=%d stdout=%q", code, out)
	}
	if !rec.Decided || rec.Blocked || !rec.WouldDeny || !rec.FloorRefused {
		t.Fatalf("want a recorded floor refusal that did not block, got %+v", rec)
	}
	if rec.Capability != "file_read" || !strings.HasSuffix(rec.Resource, "/.ssh/id_rsa") {
		t.Fatalf("unexpected mapping in record: %+v", rec)
	}
}

func TestEnforceDeniesInClaudeCodeFormat(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	code, out, rec := e.run(t, "PreToolUse", preTool(t, e.home, "Read", map[string]string{"file_path": filepath.Join(e.home, ".aws", "credentials")}))
	if code != 0 {
		t.Fatalf("code = %d", code)
	}
	var d struct {
		HookSpecificOutput struct {
			HookEventName, PermissionDecision, PermissionDecisionReason string
		}
	}
	if err := json.Unmarshal([]byte(out), &d); err != nil {
		t.Fatalf("stdout is not a decision: %q", out)
	}
	if d.HookSpecificOutput.PermissionDecision != "deny" || d.HookSpecificOutput.HookEventName != "PreToolUse" {
		t.Fatalf("got %+v", d)
	}
	if !strings.Contains(d.HookSpecificOutput.PermissionDecisionReason, "vaultysclaw") {
		t.Fatalf("the reason must say who refused: %q", d.HookSpecificOutput.PermissionDecisionReason)
	}
	if !rec.Blocked {
		t.Fatalf("record should say blocked: %+v", rec)
	}
}

func TestEnforceWithNoGrantRefusesGovernedCalls(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	_, out, rec := e.run(t, "PreToolUse", preTool(t, e.home, "Bash", map[string]string{"command": "ls"}))
	if !strings.Contains(out, `"deny"`) || !rec.Blocked {
		t.Fatalf("an unprovisioned host authorizes nothing in enforce mode; got stdout=%q rec=%+v", out, rec)
	}
}

func TestAllowedIsSilentNotAllow(t *testing.T) {
	// A tool that reaches no resource is allowed; the adapter must express that
	// as no output, so Claude Code's own permission prompt still runs.
	e := newEnv(t, state.ModeEnforce)
	_, out, rec := e.run(t, "PreToolUse", preTool(t, e.home, "TodoWrite", nil))
	if out != "" {
		t.Fatalf("an allowed call must produce no decision, got %q", out)
	}
	if rec.Blocked || !rec.NoResource {
		t.Fatalf("got %+v", rec)
	}
}

func TestUnparseablePayload(t *testing.T) {
	e := newEnv(t, state.ModeObserve)
	if _, out, rec := e.run(t, "PreToolUse", "{not json"); out != "" || rec.Error == "" {
		t.Fatalf("observe: want silent pass with recorded error, got out=%q rec=%+v", out, rec)
	}

	e = newEnv(t, state.ModeEnforce)
	if _, out, rec := e.run(t, "PreToolUse", "{not json"); !strings.Contains(out, `"deny"`) || !rec.Blocked {
		t.Fatalf("enforce: an unevaluable decision point must be refused, got out=%q rec=%+v", out, rec)
	}
	if _, out, _ := e.run(t, "PostToolUse", "{not json"); out != "" {
		t.Fatalf("non-decision events never block, got %q", out)
	}
}

func TestCorruptConfigIsTreatedAsEnforce(t *testing.T) {
	e := newEnv(t, state.ModeObserve)
	if err := os.WriteFile(e.paths.Config, []byte(`{"mode":"permissive"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, out, rec := e.run(t, "PreToolUse", preTool(t, e.home, "Bash", map[string]string{"command": "ls"}))
	if !strings.Contains(out, `"deny"`) || rec.Error == "" {
		t.Fatalf("a config that cannot be read must not switch the gate off; got out=%q rec=%+v", out, rec)
	}
}

func TestPolicyArtefactWithoutAnchorIsAnError(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	if err := os.WriteFile(e.paths.Grant, []byte("token"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, out, rec := e.run(t, "PreToolUse", preTool(t, e.home, "TodoWrite", nil))
	if !strings.Contains(out, `"deny"`) || !strings.Contains(rec.Error, "anchor") {
		t.Fatalf("got out=%q rec=%+v", out, rec)
	}
}

func TestOtherEventsAreRecordedOnly(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	code, out, rec := e.run(t, "SessionStart", `{"session_id":"s9","cwd":"/tmp","hook_event_name":"SessionStart"}`)
	if code != 0 || out != "" {
		t.Fatalf("got code=%d out=%q", code, out)
	}
	if rec.Kind != "session_start" || rec.Session != "s9" || rec.Decided {
		t.Fatalf("got %+v", rec)
	}
}

func TestAuditNeverContainsToolInput(t *testing.T) {
	e := newEnv(t, state.ModeObserve)
	e.run(t, "PreToolUse", preTool(t, e.home, "Write", map[string]string{
		"file_path": filepath.Join(e.home, "notes.txt"), "content": "SECRET-CONTENT-123",
	}))
	data, err := os.ReadFile(e.paths.Spool)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "SECRET-CONTENT-123") {
		t.Fatal("tool input leaked into the audit spool")
	}
}

// TestEnforceWithRealSignedGrant runs the whole path — anchor, packcert grant
// signed by packages/policy, toolgate — on the TS-signed conformance fixture,
// which grants api_call scoped to mcp://github/*.
func TestEnforceWithRealSignedGrant(t *testing.T) {
	var fx struct {
		ServerIDBase64 string `json:"serverIdBase64"`
		ServerDID      string `json:"serverDid"`
		Token          string `json:"token"`
	}
	data, err := os.ReadFile("../../../conformance/grant-fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &fx); err != nil {
		t.Fatal(err)
	}

	e := newEnv(t, state.ModeEnforce)
	anchor, _ := json.Marshal(map[string]string{"did": fx.ServerDID, "id": fx.ServerIDBase64})
	if err := os.WriteFile(e.paths.Anchor, anchor, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(e.paths.Grant, []byte(fx.Token), 0o600); err != nil {
		t.Fatal(err)
	}

	_, out, rec := e.run(t, "PreToolUse", preTool(t, e.home, "mcp__github__create_issue", nil))
	if out != "" || rec.Blocked || rec.CertID != "fixture-cert-0001" || rec.Error != "" {
		t.Fatalf("an in-scope MCP call must pass on the certificate; out=%q rec=%+v", out, rec)
	}

	_, out, rec = e.run(t, "PreToolUse", preTool(t, e.home, "mcp__slack__post_message", nil))
	if !strings.Contains(out, `"deny"`) || !rec.Blocked {
		t.Fatalf("an out-of-scope MCP call must be refused; out=%q rec=%+v", out, rec)
	}

	_, out, _ = e.run(t, "PreToolUse", preTool(t, e.home, "Bash", map[string]string{"command": "ls"}))
	if !strings.Contains(out, `"deny"`) {
		t.Fatalf("code_execution is not granted, so Bash must be refused; out=%q", out)
	}

	// A tampered grant must not verify, and must not degrade to "no policy".
	if err := os.WriteFile(e.paths.Grant, []byte(fx.Token[:len(fx.Token)-8]+"AAAAAAAA"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, out, rec = e.run(t, "PreToolUse", preTool(t, e.home, "mcp__github__create_issue", nil))
	if !strings.Contains(out, `"deny"`) || rec.Error == "" {
		t.Fatalf("a grant that does not verify must refuse in enforce mode; out=%q rec=%+v", out, rec)
	}
}
