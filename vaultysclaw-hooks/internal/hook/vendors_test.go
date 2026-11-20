package hook

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vaultys/vaultysclaw-hooks/internal/audit"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"

	_ "github.com/vaultys/vaultysclaw-hooks/internal/adapter/codex"
	_ "github.com/vaultys/vaultysclaw-hooks/internal/adapter/cursor"
)

func (e env) runVendor(t *testing.T, vendor, event string, payload any) (int, string, string, audit.Record) {
	t.Helper()
	b, _ := json.Marshal(payload)
	var stdout, stderr strings.Builder
	code := Run(Options{
		Vendor: vendor, Event: event, Paths: e.paths,
		Stdin: strings.NewReader(string(b)), Stdout: &stdout, Stderr: &stderr,
	})
	return code, stdout.String(), stderr.String(), e.lastRecord(t)
}

// ── Cursor ──────────────────────────────────────────────────────────────────

func cursorPreTool(cwd, tool string, input any) map[string]any {
	return map[string]any{
		"conversation_id": "c1", "hook_event_name": "preToolUse", "cwd": cwd,
		"workspace_roots": []string{cwd}, "tool_name": tool, "tool_input": input,
	}
}

type cursorAnswer struct {
	Permission   *string `json:"permission"`
	UserMessage  string  `json:"user_message"`
	AgentMessage string  `json:"agent_message"`
}

func decodeCursor(t *testing.T, out string) cursorAnswer {
	t.Helper()
	var a cursorAnswer
	if err := json.Unmarshal([]byte(out), &a); err != nil {
		t.Fatalf("a Cursor permission hook must always answer valid JSON (invalid output blocks), got %q", out)
	}
	return a
}

func TestCursorNoObjectionIsEmptyObjectNeverAllow(t *testing.T) {
	e := newEnv(t, state.ModeObserve)
	_, out, _, rec := e.runVendor(t, "cursor", "preToolUse",
		cursorPreTool(e.home, "Read", map[string]string{"file_path": filepath.Join(e.home, ".ssh", "id_rsa")}))
	if a := decodeCursor(t, out); a.Permission != nil {
		t.Fatalf("no objection must carry no permission at all, got %q", *a.Permission)
	}
	if !rec.WouldDeny || !rec.FloorRefused {
		t.Fatalf("observe still records what enforce would do: %+v", rec)
	}
}

func TestCursorEnforceDenies(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	secret := filepath.Join(e.home, ".ssh", "id_rsa")
	for _, tc := range []struct {
		event   string
		payload map[string]any
	}{
		{"preToolUse", cursorPreTool(e.home, "Read", map[string]string{"path": secret})},
		{"beforeReadFile", map[string]any{"hook_event_name": "beforeReadFile", "file_path": secret, "content": "PRIVATE KEY", "workspace_roots": []string{e.home}}},
		{"preToolUse", cursorPreTool(e.home, "Delete", map[string]string{"target_file": secret})},
	} {
		_, out, _, rec := e.runVendor(t, "cursor", tc.event, tc.payload)
		a := decodeCursor(t, out)
		if a.Permission == nil || *a.Permission != "deny" || !strings.Contains(a.AgentMessage, "vaultysclaw") {
			t.Errorf("%s: want a reasoned deny, got %q", tc.event, out)
		}
		if !strings.HasSuffix(rec.Resource, "/.ssh/id_rsa") {
			t.Errorf("%s: resource = %q", tc.event, rec.Resource)
		}
	}
	if data, _ := os.ReadFile(e.paths.Spool); strings.Contains(string(data), "PRIVATE KEY") {
		t.Fatal("beforeReadFile's file content reached the audit spool")
	}
}

func TestCursorMCPIsDeferredNotRefused(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	_, out, _, rec := e.runVendor(t, "cursor", "preToolUse", cursorPreTool(e.home, "MCP:create_issue", map[string]string{}))
	if a := decodeCursor(t, out); a.Permission != nil {
		t.Fatalf("an MCP preToolUse must be left to beforeMCPExecution, got %q", out)
	}
	if rec.Decided || !strings.Contains(rec.Reason, "beforeMCPExecution") {
		t.Fatalf("the record must say why nothing was decided: %+v", rec)
	}
	_, _, _, rec = e.runVendor(t, "cursor", "beforeMCPExecution", map[string]any{
		"hook_event_name": "beforeMCPExecution", "mcp_server_name": "github", "tool_name": "create_issue", "tool_input": "{}",
	})
	if !rec.Decided || rec.Resource != "mcp://github/create_issue" {
		t.Fatalf("beforeMCPExecution decides with the server named: %+v", rec)
	}
}

func TestCursorUnreadableFileToolIsRefusedInEnforce(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	_, out, _, rec := e.runVendor(t, "cursor", "preToolUse", cursorPreTool(e.home, "Write", map[string]string{"destination": "x"}))
	if a := decodeCursor(t, out); a.Permission == nil || *a.Permission != "deny" {
		t.Fatalf("a write to an unknown path must be refused in enforce, got %q", out)
	}
	if rec.Error == "" {
		t.Fatalf("the record must carry the parse error: %+v", rec)
	}
}

func TestCursorNonPermissionEventsAreSilent(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	_, out, _, _ := e.runVendor(t, "cursor", "stop", map[string]any{"hook_event_name": "stop"})
	if out != "" {
		t.Fatalf("stop is not a permission hook; got %q", out)
	}
}

// ── Codex ───────────────────────────────────────────────────────────────────

func codexPreTool(cwd, tool string, input any) map[string]any {
	return map[string]any{
		"session_id": "s1", "turn_id": "t1", "cwd": cwd, "hook_event_name": "PreToolUse",
		"model": "m", "permission_mode": "default", "tool_name": tool, "tool_use_id": "u1", "tool_input": input,
	}
}

func TestCodexApplyPatchDecidesEveryFile(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	patch := strings.Join([]string{
		"*** Begin Patch",
		"*** Update File: src/main.go",
		"@@",
		"-a",
		"+b",
		"*** Add File: " + filepath.Join(e.home, ".ssh", "authorized_keys"),
		"+ssh-ed25519 AAAA attacker",
		"*** End Patch",
	}, "\n")
	_, out, _, rec := e.runVendor(t, "codex", "PreToolUse", codexPreTool(e.home, "apply_patch", map[string]string{"command": patch}))
	var d struct {
		HookSpecificOutput struct{ PermissionDecision, PermissionDecisionReason string }
	}
	if err := json.Unmarshal([]byte(out), &d); err != nil || d.HookSpecificOutput.PermissionDecision != "deny" {
		t.Fatalf("one forbidden file must refuse the whole patch, got %q", out)
	}
	if d.HookSpecificOutput.PermissionDecisionReason == "" {
		t.Fatal("Codex ignores a deny without a reason")
	}
	if !rec.FloorRefused || !strings.HasSuffix(rec.Resource, "/.ssh/authorized_keys") || rec.Capability != "file_write" {
		t.Fatalf("the record must name the refused file, not the first one: %+v", rec)
	}
	if strings.Contains(mustRead(t, e.paths.Spool), "attacker") {
		t.Fatal("patch content reached the audit spool")
	}
}

func TestCodexApplyPatchWithNoReadableTargetIsRefused(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	_, out, _, _ := e.runVendor(t, "codex", "PreToolUse", codexPreTool(e.home, "apply_patch", map[string]string{"command": "garbage"}))
	if !strings.Contains(out, `"deny"`) {
		t.Fatalf("a patch with no readable target must be refused, got %q", out)
	}
}

func TestCodexAllowedIsSilent(t *testing.T) {
	e := newEnv(t, state.ModeObserve)
	code, out, _, rec := e.runVendor(t, "codex", "PreToolUse", codexPreTool(e.home, "Bash", map[string]string{"command": "ls"}))
	if code != 0 || out != "" {
		t.Fatalf("Codex rejects allow; no objection must be silent, got code=%d %q", code, out)
	}
	if !rec.Decided || rec.Capability != "code_execution" {
		t.Fatalf("record = %+v", rec)
	}
}

func mustRead(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
