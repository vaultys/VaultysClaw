// Package copilot adapts GitHub Copilot's agent hooks — Copilot CLI, and the
// VS Code agent harness that shares its format — per
// docs.github.com/en/copilot/reference/copilot-cli-reference/cli-hooks-reference
// (checked 2026-11-12, CLI 1.0.109).
//
// The documented camelCase events are used: payload {sessionId, cwd, toolName,
// toolArgs}, answer {permissionDecision, permissionDecisionReason}.
//
// What shapes this adapter:
//
//   - **"allow" skips the user's approval prompt** (CLI changelog 1.0.18). As
//     everywhere, no objection is no output.
//   - **toolArgs is documented only as "unknown"**: it is decoded whether it
//     arrives as an object or as a JSON string, and file paths are looked up
//     under several key names. A file tool with no recognisable path is an
//     error, which enforce mode refuses.
//   - **A crash fails closed, a timeout fails open.** Any non-zero exit other
//     than 2 is a refusal, so our own observe-mode error handling (exit 0) is
//     what keeps observe from blocking; a slow hook passes the call.
package copilot

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter"
)

// Vendor is the canonical key used in installed hook commands.
const Vendor = "copilot"

// Events are the hook events registered.
var Events = []string{
	"preToolUse",
	"postToolUse",
	"userPromptSubmitted",
	"sessionStart",
	"sessionEnd",
	"agentStop",
	"subagentStop",
}

type copilotAdapter struct{}

func init() { adapter.Register(copilotAdapter{}, "copilot-cli", "github-copilot") }

func (copilotAdapter) Vendor() string { return Vendor }

func (copilotAdapter) Kind(event string) adapter.Kind {
	switch event {
	case "preToolUse":
		return adapter.KindPreTool
	case "postToolUse", "postToolUseFailure":
		return adapter.KindPostTool
	case "userPromptSubmitted":
		return adapter.KindPrompt
	case "sessionStart":
		return adapter.KindSessionStart
	case "sessionEnd":
		return adapter.KindSessionEnd
	case "agentStop", "subagentStop":
		return adapter.KindStop
	}
	return adapter.KindOther
}

type payload struct {
	SessionID string          `json:"sessionId"`
	Cwd       string          `json:"cwd"`
	ToolName  string          `json:"toolName"`
	ToolArgs  json.RawMessage `json:"toolArgs"`
}

func (a copilotAdapter) Parse(event string, raw []byte) (adapter.Event, error) {
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		return adapter.Event{}, fmt.Errorf("copilot: parsing %s payload: %w", event, err)
	}
	// The camelCase payload does not repeat the event name; the installed
	// command's --event is authoritative.
	ev := adapter.Event{
		Vendor: Vendor, Kind: a.Kind(event), RawEvent: event,
		Session: p.SessionID, Cwd: p.Cwd, Tool: p.ToolName, VendorTool: p.ToolName,
	}
	if ev.Kind != adapter.KindPreTool {
		return ev, nil
	}
	if p.ToolName == "" {
		return ev, fmt.Errorf("copilot: preToolUse payload names no tool")
	}
	args, err := adapter.Object(p.ToolArgs)
	if err != nil {
		return ev, fmt.Errorf("copilot: toolArgs for %s: %w", p.ToolName, err)
	}
	if err := canonical(&ev, p.ToolName, args); err != nil {
		return ev, err
	}
	return ev, nil
}

var pathKeys = []string{"path", "file_path", "filePath", "file", "target_file"}

// canonical renames one Copilot tool into toolgate's vocabulary.
func canonical(ev *adapter.Event, tool string, args map[string]any) error {
	file := func(name string) error {
		path := adapter.FirstString(args, pathKeys...)
		if path == "" {
			return fmt.Errorf("copilot: %s arguments have no recognisable file path", tool)
		}
		ev.Tool, ev.Input = name, adapter.FileInput(path)
		return nil
	}
	switch tool {
	case "bash", "powershell":
		ev.Tool, ev.Input = "Bash", adapter.JSON(map[string]string{"command": adapter.FirstString(args, "command", "cmd", "script")})
		return nil
	case "view":
		return file("Read")
	case "create", "edit":
		return file("Write")
	case "str_replace_editor":
		// One tool, several sub-commands: only "view" reads.
		if adapter.FirstString(args, "command") == "view" {
			return file("Read")
		}
		return file("Write")
	case "apply_patch":
		paths := adapter.PatchPaths(adapter.FirstString(args, "input", "patch", "command"))
		if len(paths) == 0 {
			return fmt.Errorf("copilot: apply_patch names no file this adapter can read")
		}
		ev.Tool, ev.Input = "Write", adapter.FileInput(paths[0])
		for _, p := range paths[1:] {
			ev.More = append(ev.More, adapter.Call{Tool: "Write", Input: adapter.FileInput(p)})
		}
		return nil
	case "glob":
		ev.Tool, ev.Input = "Glob", adapter.JSON(map[string]string{"path": adapter.FirstString(args, "path", "cwd", "directory")})
		return nil
	case "grep", "rg":
		ev.Tool, ev.Input = "Grep", adapter.JSON(map[string]string{"path": adapter.FirstString(args, "path", "directory")})
		return nil
	case "web_fetch":
		ev.Tool, ev.Input = "WebFetch", adapter.JSON(map[string]string{"url": adapter.FirstString(args, "url", "uri")})
		return nil
	case "web_search":
		ev.Tool, ev.Input = "WebSearch", nil
		return nil
	case "task":
		ev.Tool, ev.Input = "Task", adapter.JSON(map[string]string{"subagent_type": adapter.FirstString(args, "agent_type", "agentType", "subagent_type", "name")})
		return nil
	case "ask_user":
		ev.Tool = "AskUserQuestion"
		return nil
	case "update_todo":
		ev.Tool = "TodoWrite"
		return nil
	}
	// MCP tool naming is undocumented; until it is verified an MCP tool keeps
	// Copilot's name and is reported unmapped (declared as a gap) rather than
	// parsed by guesswork into a resource it might not be.
	ev.Input = adapter.JSON(args)
	if strings.TrimSpace(tool) == "" {
		return fmt.Errorf("copilot: empty tool name")
	}
	return nil
}

type decision struct {
	PermissionDecision       string `json:"permissionDecision"`
	PermissionDecisionReason string `json:"permissionDecisionReason"`
}

// Respond writes a denial, and nothing otherwise. Copilot requires a reason
// with a deny.
func (copilotAdapter) Respond(ev adapter.Event, v adapter.Verdict, stdout io.Writer) int {
	if ev.Kind != adapter.KindPreTool || !v.Deny {
		return 0
	}
	reason := v.Reason
	if strings.TrimSpace(reason) == "" {
		reason = "vaultysclaw: refused"
	}
	if err := json.NewEncoder(stdout).Encode(decision{PermissionDecision: "deny", PermissionDecisionReason: reason}); err != nil {
		return 2 // Copilot reads exit 2 as deny regardless of stdout.
	}
	return 0
}
