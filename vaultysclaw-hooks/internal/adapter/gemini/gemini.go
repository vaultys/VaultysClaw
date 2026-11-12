// Package gemini adapts Google's Gemini CLI hooks, as implemented in
// google-gemini/gemini-cli v0.68.0 (packages/core/src/hooks, checked
// 2026-11-12).
//
// The payload is Claude-shaped (session_id, cwd, hook_event_name, tool_name,
// tool_input); the event is BeforeTool and the denial is
// {"decision":"deny","reason":…}. "allow" would not skip Gemini's own
// confirmation, but no objection is still no output, as everywhere.
//
// Tool names are Gemini's own and are renamed here. Two need more than a
// rename:
//
//   - **MCP** tools are named mcp_<server>_<tool> with single underscores, which
//     cannot be split reliably (a server name may contain "_", and long names are
//     truncated). The payload's mcp_context names the server and tool; it is the
//     only thing used.
//   - **web_fetch** takes a prompt with the URLs embedded in its text. Every URL
//     in it is a fetch to decide; a prompt naming none is refused in enforce
//     mode, since what it would fetch cannot be known.
package gemini

import (
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter"
)

// Vendor is the canonical key used in installed hook commands.
const Vendor = "gemini"

// Events are the hook events registered.
var Events = []string{"BeforeTool", "AfterTool", "BeforeAgent", "SessionStart", "SessionEnd"}

// ToolMatcherEvents take a matcher.
var ToolMatcherEvents = map[string]bool{"BeforeTool": true, "AfterTool": true}

type geminiAdapter struct{}

func init() { adapter.Register(geminiAdapter{}, "gemini-cli") }

func (geminiAdapter) Vendor() string { return Vendor }

func (geminiAdapter) Kind(event string) adapter.Kind {
	switch event {
	case "BeforeTool":
		return adapter.KindPreTool
	case "AfterTool":
		return adapter.KindPostTool
	case "BeforeAgent":
		return adapter.KindPrompt
	case "SessionStart":
		return adapter.KindSessionStart
	case "SessionEnd":
		return adapter.KindSessionEnd
	}
	return adapter.KindOther
}

type payload struct {
	SessionID     string          `json:"session_id"`
	Cwd           string          `json:"cwd"`
	HookEventName string          `json:"hook_event_name"`
	ToolName      string          `json:"tool_name"`
	ToolInput     json.RawMessage `json:"tool_input"`
	MCPContext    *struct {
		ServerName string `json:"server_name"`
		ToolName   string `json:"tool_name"`
	} `json:"mcp_context"`
}

func (a geminiAdapter) Parse(event string, raw []byte) (adapter.Event, error) {
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		return adapter.Event{}, fmt.Errorf("gemini: parsing %s payload: %w", event, err)
	}
	name := p.HookEventName
	if name == "" {
		name = event
	}
	ev := adapter.Event{
		Vendor: Vendor, Kind: a.Kind(name), RawEvent: name,
		Session: p.SessionID, Cwd: p.Cwd, Tool: p.ToolName, VendorTool: p.ToolName,
	}
	if ev.Kind != adapter.KindPreTool {
		return ev, nil
	}
	if p.ToolName == "" {
		return ev, fmt.Errorf("gemini: BeforeTool payload names no tool")
	}
	if p.MCPContext != nil {
		if p.MCPContext.ServerName == "" || p.MCPContext.ToolName == "" {
			return ev, fmt.Errorf("gemini: mcp_context names no server or tool")
		}
		ev.Tool = "mcp__" + p.MCPContext.ServerName + "__" + p.MCPContext.ToolName
		return ev, nil
	}
	args, err := adapter.Object(p.ToolInput)
	if err != nil {
		return ev, fmt.Errorf("gemini: tool_input for %s: %w", p.ToolName, err)
	}
	return ev, canonical(&ev, p.ToolName, args)
}

var urlPattern = regexp.MustCompile(`https?://[^\s<>"'\x60)\]]+`)

func canonical(ev *adapter.Event, tool string, args map[string]any) error {
	file := func(name string) error {
		path := adapter.FirstString(args, "file_path", "absolute_path", "path")
		if path == "" {
			return fmt.Errorf("gemini: %s arguments have no file_path", tool)
		}
		ev.Tool, ev.Input = name, adapter.FileInput(path)
		return nil
	}
	dir := func(name string) {
		ev.Tool, ev.Input = name, adapter.JSON(map[string]string{"path": adapter.FirstString(args, "dir_path", "path")})
	}
	switch tool {
	case "run_shell_command":
		ev.Tool, ev.Input = "Bash", adapter.JSON(map[string]string{"command": adapter.FirstString(args, "command")})
	case "read_file":
		return file("Read")
	case "write_file", "replace", "edit":
		return file("Write")
	case "read_many_files":
		// include entries are paths or glob patterns relative to cwd. Each is
		// decided as a read of that (literal) path: a pattern under a forbidden
		// directory is refused by the prefix it names.
		var paths []string
		if list, ok := args["include"].([]any); ok {
			for _, x := range list {
				if s, ok := x.(string); ok && strings.TrimSpace(s) != "" {
					paths = append(paths, s)
				}
			}
		}
		if len(paths) == 0 {
			return fmt.Errorf("gemini: read_many_files names no include path")
		}
		ev.Tool, ev.Input = "Read", adapter.FileInput(paths[0])
		for _, p := range paths[1:] {
			ev.More = append(ev.More, adapter.Call{Tool: "Read", Input: adapter.FileInput(p)})
		}
	case "glob":
		dir("Glob")
	case "grep_search", "search_file_content", "list_directory":
		dir("Grep")
	case "web_fetch":
		urls := urlPattern.FindAllString(adapter.FirstString(args, "prompt", "url"), -1)
		if len(urls) == 0 {
			return fmt.Errorf("gemini: web_fetch prompt names no URL")
		}
		ev.Tool, ev.Input = "WebFetch", adapter.JSON(map[string]string{"url": urls[0]})
		for _, u := range urls[1:] {
			ev.More = append(ev.More, adapter.Call{Tool: "WebFetch", Input: adapter.JSON(map[string]string{"url": u})})
		}
	case "google_web_search":
		ev.Tool, ev.Input = "WebSearch", nil
	case "write_todos":
		ev.Tool = "TodoWrite"
	case "ask_user":
		ev.Tool = "AskUserQuestion"
	case "exit_plan_mode":
		ev.Tool = "ExitPlanMode"
	default:
		// Anything else keeps Gemini's name and is reported unmapped.
		ev.Input = adapter.JSON(args)
	}
	return nil
}

type decision struct {
	Decision string `json:"decision"`
	Reason   string `json:"reason"`
}

// Respond writes a denial, and nothing otherwise. Gemini treats empty output
// as no objection.
func (geminiAdapter) Respond(ev adapter.Event, v adapter.Verdict, stdout io.Writer) int {
	if ev.Kind != adapter.KindPreTool || !v.Deny {
		return 0
	}
	reason := v.Reason
	if strings.TrimSpace(reason) == "" {
		reason = "vaultysclaw: refused"
	}
	if err := json.NewEncoder(stdout).Encode(decision{Decision: "deny", Reason: reason}); err != nil {
		// Exit 2 with plain-text stderr is Gemini's other deny path; the hook
		// package writes the reason there.
		return 2
	}
	return 0
}
