// Package cursor adapts Cursor's agent hooks (the editor's agent and the
// cursor-agent CLI), as documented at https://cursor.com/docs/agent/hooks
// (checked 2026-11-12).
//
// Three properties of Cursor's protocol shape this adapter, and each differs
// from Claude Code's:
//
//   - **Invalid output is a refusal.** On a permission hook, stdout that is not
//     valid JSON for the event blocks the action, even with failClosed off. So a
//     decision event always gets a JSON object — `{}` when we have no
//     objection — never empty output.
//   - **Never "allow".** As with Claude Code, "no objection" is rendered as the
//     absence of a permission, not as `"permission": "allow"`: the docs do not
//     say whether allow skips Cursor's own approval, and the safe reading is
//     that it might.
//   - **Several events decide.** preToolUse is the generic pre-tool event and
//     the only one that sees file writes and deletes before they happen. The
//     category events (shell, file read, MCP, tab read) are registered too:
//     they carry better payloads, and cursor-agent has historically fired only
//     some events. A call can therefore be decided twice; both decisions are
//     the same pure function of the same policy, so they agree.
//
// Tool names and inputs are renamed into toolgate's canonical (Claude Code)
// vocabulary here, never in a second mapping table.
package cursor

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter"
)

// Vendor is the canonical key used in installed hook commands.
const Vendor = "cursor"

// Events are the hook events registered in hooks.json.
var Events = []string{
	"preToolUse",
	"beforeShellExecution",
	"beforeReadFile",
	"beforeMCPExecution",
	"beforeTabFileRead",
	"postToolUse",
	"afterFileEdit",
	"beforeSubmitPrompt",
	"sessionStart",
	"sessionEnd",
	"stop",
	"subagentStop",
}

// DecisionEvents are the permission hooks: each must answer with valid JSON.
var DecisionEvents = map[string]bool{
	"preToolUse":           true,
	"beforeShellExecution": true,
	"beforeReadFile":       true,
	"beforeMCPExecution":   true,
	"beforeTabFileRead":    true,
}

type cursorAdapter struct{}

func init() { adapter.Register(cursorAdapter{}, "cursor-agent") }

func (cursorAdapter) Vendor() string { return Vendor }

func (cursorAdapter) Kind(event string) adapter.Kind {
	switch {
	case DecisionEvents[event]:
		return adapter.KindPreTool
	case event == "postToolUse" || event == "afterFileEdit" || event == "postToolUseFailure":
		return adapter.KindPostTool
	case event == "beforeSubmitPrompt":
		return adapter.KindPrompt
	case event == "sessionStart":
		return adapter.KindSessionStart
	case event == "sessionEnd":
		return adapter.KindSessionEnd
	case event == "stop" || event == "subagentStop":
		return adapter.KindStop
	}
	return adapter.KindOther
}

// payload declares only what this adapter reads. Notably *not* `content`
// (beforeReadFile and beforeTabFileRead send the file's contents) or `prompt`:
// an adapter that never decodes them cannot leak them.
type payload struct {
	ConversationID string          `json:"conversation_id"`
	HookEventName  string          `json:"hook_event_name"`
	WorkspaceRoots []string        `json:"workspace_roots"`
	Cwd            string          `json:"cwd"`
	ToolName       string          `json:"tool_name"`
	ToolInput      json.RawMessage `json:"tool_input"`
	Command        string          `json:"command"`
	FilePath       string          `json:"file_path"`
	MCPServerName  string          `json:"mcp_server_name"`
}

func (a cursorAdapter) Parse(event string, raw []byte) (adapter.Event, error) {
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		return adapter.Event{}, fmt.Errorf("cursor: parsing %s payload: %w", event, err)
	}
	name := p.HookEventName
	if name == "" {
		name = event
	}
	cwd := p.Cwd
	if cwd == "" && len(p.WorkspaceRoots) > 0 {
		cwd = p.WorkspaceRoots[0]
	}
	ev := adapter.Event{
		Vendor:   Vendor,
		Kind:     a.Kind(name),
		RawEvent: name,
		Session:  p.ConversationID,
		Cwd:      cwd,
	}
	if ev.Kind != adapter.KindPreTool {
		ev.Tool, ev.VendorTool = p.ToolName, p.ToolName
		return ev, nil
	}

	tool, input, err := canonical(name, p)
	if err != nil {
		ev.VendorTool = p.ToolName
		return ev, err
	}
	ev.Tool, ev.Input = tool, input
	ev.VendorTool = p.ToolName
	if ev.VendorTool == "" {
		ev.VendorTool = name
	}
	return ev, nil
}

// canonical renames one decision event into toolgate's vocabulary.
//
// A file tool whose path cannot be found is an error, not an empty path: in
// enforce mode an unparseable decision is refused, which is the right answer
// to "Cursor changed its input shape".
func canonical(event string, p payload) (string, json.RawMessage, error) {
	switch event {
	case "beforeShellExecution":
		return "Bash", mustJSON(map[string]string{"command": p.Command}), nil
	case "beforeReadFile", "beforeTabFileRead":
		if p.FilePath == "" {
			return "", nil, fmt.Errorf("cursor: %s payload names no file_path", event)
		}
		return "Read", mustJSON(map[string]string{"file_path": p.FilePath}), nil
	case "beforeMCPExecution":
		if p.MCPServerName == "" || p.ToolName == "" {
			return "", nil, fmt.Errorf("cursor: beforeMCPExecution payload names no server or tool")
		}
		return "mcp__" + p.MCPServerName + "__" + p.ToolName, nil, nil
	}

	// preToolUse.
	if p.ToolName == "" {
		return "", nil, fmt.Errorf("cursor: preToolUse payload names no tool")
	}
	in := map[string]any{}
	if len(p.ToolInput) > 0 {
		// Some Cursor events send tool_input as a JSON string rather than an
		// object; accept both.
		var s string
		if json.Unmarshal(p.ToolInput, &s) == nil {
			_ = json.Unmarshal([]byte(s), &in)
		} else if err := json.Unmarshal(p.ToolInput, &in); err != nil {
			return "", nil, fmt.Errorf("cursor: preToolUse tool_input for %s: %w", p.ToolName, err)
		}
	}
	switch p.ToolName {
	case "Shell":
		return "Bash", mustJSON(map[string]string{"command": firstString(in, "command", "cmd")}), nil
	case "Read":
		return fileTool("Read", p.ToolName, in)
	case "Write", "Edit", "Delete":
		// A delete is a write to the file: it needs the same capability over the
		// same resource.
		return fileTool("Write", p.ToolName, in)
	case "Grep":
		return "Grep", mustJSON(map[string]string{"path": firstString(in, "path", "target_directory", "directory")}), nil
	case "Task":
		return "Task", mustJSON(map[string]string{"subagent_type": firstString(in, "subagent_type", "subagentType", "agent")}), nil
	}
	if strings.HasPrefix(p.ToolName, "MCP:") {
		// preToolUse does not say which server an MCP tool belongs to, and
		// deciding with a guessed server would refuse legitimate calls (or,
		// guessed the other way, widen a scope). beforeMCPExecution carries the
		// server and decides instead; see install's Gaps for the consequence.
		return "", nil, fmt.Errorf("%w: cursor decides MCP tools on beforeMCPExecution, which names the server", adapter.ErrDeferred)
	}
	// Anything else passes under Cursor's own name: toolgate reports it as
	// unmapped, which the audit trail and coverage both surface.
	return p.ToolName, p.ToolInput, nil
}

func fileTool(canonicalName, cursorName string, in map[string]any) (string, json.RawMessage, error) {
	path := firstString(in, "file_path", "path", "target_file", "filePath", "file")
	if path == "" {
		return "", nil, fmt.Errorf("cursor: %s tool_input has no recognisable file path", cursorName)
	}
	return canonicalName, mustJSON(map[string]string{"file_path": path}), nil
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if s, ok := m[k].(string); ok && strings.TrimSpace(s) != "" {
			return s
		}
	}
	return ""
}

func mustJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// response is a permission hook's answer.
type response struct {
	Permission   string `json:"permission,omitempty"`
	UserMessage  string `json:"user_message,omitempty"`
	AgentMessage string `json:"agent_message,omitempty"`
}

// Respond answers every permission hook with a JSON object — a denial, or `{}`
// — and every other event with nothing.
func (cursorAdapter) Respond(ev adapter.Event, v adapter.Verdict, stdout io.Writer) int {
	if !DecisionEvents[ev.RawEvent] {
		return 0
	}
	var r response
	if ev.Kind == adapter.KindPreTool && v.Deny {
		r = response{Permission: "deny", UserMessage: v.Reason, AgentMessage: v.Reason}
	}
	if err := json.NewEncoder(stdout).Encode(r); err != nil {
		// Exit 2 is Cursor's other blocking channel. For a non-denial the
		// output was already going to be unusable — and Cursor blocks on that
		// anyway — so there is no fail-open path to preserve here.
		return 2
	}
	return 0
}
