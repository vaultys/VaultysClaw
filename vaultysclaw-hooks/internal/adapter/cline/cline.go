// Package cline adapts Cline's hooks — the VS Code extension and the Cline CLI
// — as implemented in cline/cline v4.1.26 (checked 2026-11-12).
//
// Cline's model differs from every other harness here:
//
//   - **Hooks are executable files** named after the event (PreToolUse, or
//     PreToolUse.ps1 on Windows) in a hooks directory, not entries in a
//     settings file. The installer writes a two-line script calling us.
//   - **Two payload shapes.** The VS Code extension sends
//     preToolUse: {toolName, parameters} with every parameter value converted
//     to a string; the CLI sends tool_call: {name, input} with the model's raw
//     input. tool_call is preferred when present, and string parameters are
//     JSON-decoded where they hold a list.
//   - **Tools take lists.** run_commands, read_files and fetch_web_content each
//     carry several items, and the model's raw input is loosely shaped (a
//     string, a list of strings, a list of objects). Every item is decided
//     (adapter.Event.More); the call is refused if any one is.
//   - **A refusal stops the turn.** cancel:true ends the whole turn, not just
//     the one tool — stricter than other harnesses, and the only refusal Cline
//     offers. The reason goes in errorMessage.
//
// There is no "allow" in Cline's output contract at all; no objection is no
// output, which Cline reads as cancel:false.
package cline

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter"
)

// Vendor is the canonical key used in installed hook commands.
const Vendor = "cline"

// Events are the hook files installed. The VS Code extension wires exactly
// these; the CLI wires a superset.
var Events = []string{"PreToolUse", "PostToolUse", "UserPromptSubmit", "TaskStart", "TaskComplete", "TaskCancel"}

type clineAdapter struct{}

func init() { adapter.Register(clineAdapter{}, "cline-cli") }

func (clineAdapter) Vendor() string { return Vendor }

func (clineAdapter) Kind(event string) adapter.Kind {
	switch event {
	case "PreToolUse":
		return adapter.KindPreTool
	case "PostToolUse":
		return adapter.KindPostTool
	case "UserPromptSubmit":
		return adapter.KindPrompt
	case "TaskStart", "TaskResume":
		return adapter.KindSessionStart
	case "TaskComplete", "TaskCancel", "TaskError", "SessionShutdown":
		return adapter.KindSessionEnd
	}
	return adapter.KindOther
}

type payload struct {
	TaskID         string   `json:"taskId"`
	WorkspaceRoots []string `json:"workspaceRoots"`
	ToolCall       *struct {
		Name  string          `json:"name"`
		Input json.RawMessage `json:"input"`
	} `json:"tool_call"`
	PreToolUse *struct {
		ToolName   string            `json:"toolName"`
		Parameters map[string]string `json:"parameters"`
	} `json:"preToolUse"`
}

func (a clineAdapter) Parse(event string, raw []byte) (adapter.Event, error) {
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		return adapter.Event{}, fmt.Errorf("cline: parsing %s payload: %w", event, err)
	}
	// hookName differs between the extension ("PreToolUse") and the CLI
	// ("tool_call"); the installed file's --event is authoritative.
	ev := adapter.Event{Vendor: Vendor, Kind: a.Kind(event), RawEvent: event, Session: p.TaskID}
	if len(p.WorkspaceRoots) > 0 {
		ev.Cwd = p.WorkspaceRoots[0]
	}
	if ev.Kind != adapter.KindPreTool {
		return ev, nil
	}

	var tool string
	args := map[string]any{}
	switch {
	case p.ToolCall != nil && p.ToolCall.Name != "":
		tool = p.ToolCall.Name
		if err := json.Unmarshal(p.ToolCall.Input, &args); err != nil {
			// A bare string is valid model input for several tools.
			var s string
			if json.Unmarshal(p.ToolCall.Input, &s) != nil {
				return ev, fmt.Errorf("cline: tool_call input for %s: %w", tool, err)
			}
			args["_"] = s
		}
	case p.PreToolUse != nil && p.PreToolUse.ToolName != "":
		tool = p.PreToolUse.ToolName
		for k, v := range p.PreToolUse.Parameters {
			// Non-string values arrive JSON.stringify'd; decode what decodes.
			var decoded any
			if (strings.HasPrefix(v, "[") || strings.HasPrefix(v, "{")) && json.Unmarshal([]byte(v), &decoded) == nil {
				args[k] = decoded
			} else {
				args[k] = v
			}
		}
	default:
		return ev, fmt.Errorf("cline: PreToolUse payload names no tool")
	}
	ev.Tool, ev.VendorTool = tool, tool
	return ev, canonical(&ev, tool, args)
}

// items flattens a loosely-shaped list argument: a string, a list of strings,
// or a list of objects (reading key from each), under any of keys.
func items(args map[string]any, key string, keys ...string) []string {
	var out []string
	add := func(v any) {
		switch x := v.(type) {
		case string:
			if strings.TrimSpace(x) != "" {
				out = append(out, x)
			}
		case map[string]any:
			if s := adapter.FirstString(x, key, "path", "file_path", "url", "command"); s != "" {
				if args, ok := x["args"].([]any); ok && key == "command" {
					for _, a := range args {
						if as, ok := a.(string); ok {
							s += " " + as
						}
					}
				}
				out = append(out, s)
			}
		}
	}
	for _, k := range keys {
		switch v := args[k].(type) {
		case []any:
			for _, x := range v {
				add(x)
			}
		case nil:
		default:
			add(v)
		}
	}
	return out
}

func fanOut(ev *adapter.Event, tool string, inputs []json.RawMessage) {
	ev.Tool, ev.Input = tool, inputs[0]
	for _, in := range inputs[1:] {
		ev.More = append(ev.More, adapter.Call{Tool: tool, Input: in})
	}
}

func canonical(ev *adapter.Event, tool string, args map[string]any) error {
	switch tool {
	// Current (SDK) tool names.
	case "run_commands", "execute_command":
		cmds := items(args, "command", "commands", "command", "cmd", "_")
		if len(cmds) == 0 {
			return fmt.Errorf("cline: %s names no command", tool)
		}
		in := make([]json.RawMessage, len(cmds))
		for i, c := range cmds {
			in[i] = adapter.JSON(map[string]string{"command": c})
		}
		fanOut(ev, "Bash", in)
	case "read_files", "read_file":
		paths := items(args, "path", "files", "file_paths", "paths", "path", "_")
		if len(paths) == 0 {
			return fmt.Errorf("cline: %s names no file", tool)
		}
		in := make([]json.RawMessage, len(paths))
		for i, p := range paths {
			in[i] = adapter.FileInput(p)
		}
		fanOut(ev, "Read", in)
	case "editor", "write_to_file", "replace_in_file":
		path := adapter.FirstString(args, "path", "file_path")
		if path == "" {
			return fmt.Errorf("cline: %s names no file", tool)
		}
		ev.Tool, ev.Input = "Write", adapter.FileInput(path)
	case "apply_patch":
		paths := adapter.PatchPaths(adapter.FirstString(args, "input", "patch", "_"))
		if len(paths) == 0 {
			return fmt.Errorf("cline: apply_patch names no file this adapter can read")
		}
		in := make([]json.RawMessage, len(paths))
		for i, p := range paths {
			in[i] = adapter.FileInput(p)
		}
		fanOut(ev, "Write", in)
	case "fetch_web_content", "web_fetch":
		urls := items(args, "url", "requests", "urls", "url", "_")
		if len(urls) == 0 {
			return fmt.Errorf("cline: %s names no URL", tool)
		}
		in := make([]json.RawMessage, len(urls))
		for i, u := range urls {
			in[i] = adapter.JSON(map[string]string{"url": u})
		}
		fanOut(ev, "WebFetch", in)
	case "search_codebase", "search_files", "list_files":
		ev.Tool, ev.Input = "Grep", adapter.JSON(map[string]string{"path": adapter.FirstString(args, "path", "directory")})
	case "ask_question", "ask_followup_question":
		ev.Tool = "AskUserQuestion"
	case "use_mcp_tool":
		server, name := adapter.FirstString(args, "server_name"), adapter.FirstString(args, "tool_name")
		if server == "" || name == "" {
			return fmt.Errorf("cline: use_mcp_tool names no server or tool")
		}
		ev.Tool = "mcp__" + server + "__" + name
	default:
		// SDK MCP tools are named server__tool; built-in names never contain
		// "__". Anything else keeps Cline's name and is reported unmapped.
		if i := strings.Index(tool, "__"); i > 0 && i+2 < len(tool) {
			ev.Tool = "mcp__" + tool
		}
		ev.Input = adapter.JSON(args)
	}
	return nil
}

type control struct {
	Cancel       bool   `json:"cancel"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

// Respond cancels on a denial and writes nothing otherwise.
func (clineAdapter) Respond(ev adapter.Event, v adapter.Verdict, stdout io.Writer) int {
	if ev.Kind != adapter.KindPreTool || !v.Deny {
		return 0
	}
	reason := v.Reason
	if strings.TrimSpace(reason) == "" {
		reason = "vaultysclaw: refused"
	}
	if err := json.NewEncoder(stdout).Encode(control{Cancel: true, ErrorMessage: reason}); err != nil {
		// Cline has no exit-code refusal: a non-zero exit without JSON is a
		// hook error, and hook errors fail open. Nothing better is possible.
		return 1
	}
	return 0
}
