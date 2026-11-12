package hook

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vaultys/vaultysclaw-hooks/internal/state"

	_ "github.com/vaultys/vaultysclaw-hooks/internal/adapter/cline"
	_ "github.com/vaultys/vaultysclaw-hooks/internal/adapter/copilot"
	_ "github.com/vaultys/vaultysclaw-hooks/internal/adapter/gemini"
)

// ── Copilot ─────────────────────────────────────────────────────────────────

func TestCopilotToolArgsAsStringAndDenyFormat(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	args, _ := json.Marshal(map[string]string{"path": filepath.Join(e.home, ".ssh", "id_rsa")})
	_, out, _, rec := e.runVendor(t, "copilot", "preToolUse", map[string]any{
		"sessionId": "s", "timestamp": 1, "cwd": e.home, "toolName": "view", "toolArgs": string(args),
	})
	var d struct{ PermissionDecision, PermissionDecisionReason string }
	if err := json.Unmarshal([]byte(out), &d); err != nil || d.PermissionDecision != "deny" || d.PermissionDecisionReason == "" {
		t.Fatalf("want a reasoned top-level deny, got %q", out)
	}
	if rec.Capability != "file_read" || !strings.HasSuffix(rec.Resource, "/.ssh/id_rsa") {
		t.Fatalf("toolArgs sent as a JSON string must still be read: %+v", rec)
	}
}

func TestCopilotNoObjectionIsSilent(t *testing.T) {
	e := newEnv(t, state.ModeObserve)
	code, out, _, rec := e.runVendor(t, "copilot", "preToolUse", map[string]any{
		"cwd": e.home, "toolName": "bash", "toolArgs": map[string]string{"command": "ls"},
	})
	if code != 0 || out != "" {
		t.Fatalf("Copilot's allow skips the approval prompt; no objection must be silent, got %d %q", code, out)
	}
	if rec.Capability != "code_execution" {
		t.Fatalf("record = %+v", rec)
	}
}

// ── Gemini CLI ──────────────────────────────────────────────────────────────

func geminiBefore(cwd, tool string, input any, extra map[string]any) map[string]any {
	p := map[string]any{"session_id": "s", "cwd": cwd, "hook_event_name": "BeforeTool", "tool_name": tool, "tool_input": input}
	for k, v := range extra {
		p[k] = v
	}
	return p
}

func TestGeminiDenyFormatAndManyFiles(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	_, out, _, rec := e.runVendor(t, "gemini", "BeforeTool",
		geminiBefore(e.home, "read_many_files", map[string]any{"include": []string{"README.md", ".ssh/id_rsa"}}, nil))
	var d struct{ Decision, Reason string }
	if err := json.Unmarshal([]byte(out), &d); err != nil || d.Decision != "deny" || d.Reason == "" {
		t.Fatalf("want {decision: deny}, got %q", out)
	}
	if !rec.FloorRefused || !strings.HasSuffix(rec.Resource, "/.ssh/id_rsa") {
		t.Fatalf("every include path is decided; the floor refusal must be the one recorded: %+v", rec)
	}
}

func TestGeminiMCPUsesContextAndWebFetchReadsURLs(t *testing.T) {
	e := newEnv(t, state.ModeObserve)
	_, _, _, rec := e.runVendor(t, "gemini", "BeforeTool", geminiBefore(e.home, "mcp_git_hub_create_issue", map[string]any{},
		map[string]any{"mcp_context": map[string]string{"server_name": "git_hub", "tool_name": "create_issue"}}))
	if rec.Resource != "mcp://git_hub/create_issue" {
		t.Fatalf("MCP server must come from mcp_context, not the ambiguous tool name: %+v", rec)
	}
	_, _, _, rec = e.runVendor(t, "gemini", "BeforeTool",
		geminiBefore(e.home, "web_fetch", map[string]string{"prompt": "summarise https://example.com/a and https://evil.test/x"}, nil))
	if rec.Capability != "internet_access" {
		t.Fatalf("web_fetch URLs come from the prompt text: %+v", rec)
	}
	e2 := newEnv(t, state.ModeEnforce)
	_, out, _, _ := e2.runVendor(t, "gemini", "BeforeTool", geminiBefore(e2.home, "web_fetch", map[string]string{"prompt": "no link here"}, nil))
	if !strings.Contains(out, `"deny"`) {
		t.Fatalf("a fetch whose target cannot be known is refused in enforce, got %q", out)
	}
}

// ── Cline ───────────────────────────────────────────────────────────────────

func TestClineBothPayloadShapes(t *testing.T) {
	e := newEnv(t, state.ModeEnforce)
	secret := filepath.Join(e.home, ".ssh", "id_rsa")

	// The CLI's raw model input: a list of objects.
	_, out, _, rec := e.runVendor(t, "cline", "PreToolUse", map[string]any{
		"hookName": "tool_call", "taskId": "t", "workspaceRoots": []string{e.home},
		"tool_call": map[string]any{"id": "1", "name": "read_files", "input": map[string]any{
			"files": []any{map[string]any{"path": "README.md"}, map[string]any{"path": secret}},
		}},
	})
	var c struct {
		Cancel       bool
		ErrorMessage string
	}
	if err := json.Unmarshal([]byte(out), &c); err != nil || !c.Cancel || c.ErrorMessage == "" {
		t.Fatalf("want {cancel: true, errorMessage}, got %q", out)
	}
	if !strings.HasSuffix(rec.Resource, "/.ssh/id_rsa") {
		t.Fatalf("every listed file is decided: %+v", rec)
	}

	// The extension's stringified parameters.
	files, _ := json.Marshal([]map[string]string{{"path": secret}})
	_, out, _, _ = e.runVendor(t, "cline", "PreToolUse", map[string]any{
		"hookName": "PreToolUse", "taskId": "t", "workspaceRoots": []string{e.home},
		"preToolUse": map[string]any{"toolName": "read_files", "parameters": map[string]string{"files": string(files)}},
	})
	if !strings.Contains(out, `"cancel":true`) {
		t.Fatalf("stringified parameters must be decoded and decided, got %q", out)
	}
}

func TestClineCommandsAndSilence(t *testing.T) {
	e := newEnv(t, state.ModeObserve)
	code, out, _, rec := e.runVendor(t, "cline", "PreToolUse", map[string]any{
		"workspaceRoots": []string{e.home},
		"tool_call": map[string]any{"name": "run_commands", "input": map[string]any{
			"commands": []any{"ls", map[string]any{"command": "git", "args": []any{"status"}}},
		}},
	})
	if code != 0 || out != "" {
		t.Fatalf("no objection must be silent, got %d %q", code, out)
	}
	if rec.Capability != "code_execution" {
		t.Fatalf("record = %+v", rec)
	}
	_, _, _, rec = e.runVendor(t, "cline", "PreToolUse", map[string]any{
		"workspaceRoots": []string{e.home},
		"tool_call":      map[string]any{"name": "github__create_issue", "input": map[string]any{}},
	})
	if rec.Resource != "mcp://github/create_issue" {
		t.Fatalf("server__tool is an MCP tool: %+v", rec)
	}
}
