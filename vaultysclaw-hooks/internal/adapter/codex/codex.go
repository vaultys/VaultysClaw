// Package codex adapts OpenAI Codex's lifecycle hooks, as implemented in
// openai/codex rust-v0.167.2 (codex-rs/hooks, checked 2026-11-12).
//
// Codex deliberately follows Claude Code's hook protocol: the same payload
// fields (session_id, cwd, hook_event_name, tool_name, tool_input) and the same
// PreToolUse denial shape. What differs, and is handled here:
//
//   - **apply_patch.** File edits arrive as one tool whose input is the whole
//     patch text, and one patch can add, update, delete and move several files.
//     Each touched path becomes its own file write (adapter.Event.More), so a
//     patch that edits one permitted file and one forbidden one is refused.
//   - **spawn_agent** is Codex's subagent tool; it maps to Task.
//
// Codex rejects "allow" outright (permissionDecision allow without
// updatedInput is "unsupported"), so the no-output rule costs nothing here; it
// is kept for the same reason as everywhere else.
package codex

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter"
)

// Vendor is the canonical key used in installed hook commands.
const Vendor = "codex"

// Events are the hook events registered with Codex.
var Events = []string{
	"PreToolUse",
	"PostToolUse",
	"UserPromptSubmit",
	"SessionStart",
	"SessionEnd",
	"Stop",
	"SubagentStop",
}

// ToolMatcherEvents take a matcher.
var ToolMatcherEvents = map[string]bool{"PreToolUse": true, "PostToolUse": true}

type codexAdapter struct{}

func init() { adapter.Register(codexAdapter{}, "openai-codex") }

func (codexAdapter) Vendor() string { return Vendor }

func (codexAdapter) Kind(event string) adapter.Kind {
	switch event {
	case "PreToolUse":
		return adapter.KindPreTool
	case "PostToolUse":
		return adapter.KindPostTool
	case "UserPromptSubmit":
		return adapter.KindPrompt
	case "SessionStart":
		return adapter.KindSessionStart
	case "SessionEnd":
		return adapter.KindSessionEnd
	case "Stop", "SubagentStop":
		return adapter.KindStop
	}
	return adapter.KindOther
}

type payload struct {
	SessionID     string          `json:"session_id"`
	Cwd           string          `json:"cwd"`
	HookEventName string          `json:"hook_event_name"`
	ToolName      string          `json:"tool_name"`
	ToolInput     json.RawMessage `json:"tool_input"`
}

func (a codexAdapter) Parse(event string, raw []byte) (adapter.Event, error) {
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		return adapter.Event{}, fmt.Errorf("codex: parsing %s payload: %w", event, err)
	}
	name := p.HookEventName
	if name == "" {
		name = event
	}
	ev := adapter.Event{
		Vendor:     Vendor,
		Kind:       a.Kind(name),
		RawEvent:   name,
		Session:    p.SessionID,
		Cwd:        p.Cwd,
		Tool:       p.ToolName,
		VendorTool: p.ToolName,
		Input:      p.ToolInput,
	}
	if ev.Kind != adapter.KindPreTool {
		return ev, nil
	}
	if ev.Tool == "" {
		return ev, fmt.Errorf("codex: PreToolUse payload names no tool")
	}

	switch p.ToolName {
	case "apply_patch":
		var in struct {
			Command string `json:"command"`
		}
		if err := json.Unmarshal(p.ToolInput, &in); err != nil {
			return ev, fmt.Errorf("codex: apply_patch input: %w", err)
		}
		paths := PatchPaths(in.Command)
		if len(paths) == 0 {
			// Refused in enforce mode: a patch whose targets cannot be read is
			// a write to somewhere unknown.
			return ev, fmt.Errorf("codex: apply_patch names no file this adapter can read")
		}
		ev.Tool, ev.Input = "Write", fileInput(paths[0])
		for _, path := range paths[1:] {
			ev.More = append(ev.More, adapter.Call{Tool: "Write", Input: fileInput(path)})
		}
	case "spawn_agent":
		var in map[string]any
		_ = json.Unmarshal(p.ToolInput, &in)
		agent := ""
		for _, k := range []string{"agent_type", "subagent_type", "name"} {
			if s, ok := in[k].(string); ok && s != "" {
				agent = s
				break
			}
		}
		b, _ := json.Marshal(map[string]string{"subagent_type": agent})
		ev.Tool, ev.Input = "Task", b
	}
	// Bash and mcp__<server>__<tool> are already canonical. Anything else keeps
	// Codex's name and is reported unmapped by toolgate.
	return ev, nil
}

func fileInput(path string) json.RawMessage {
	b, _ := json.Marshal(map[string]string{"file_path": path})
	return b
}

// PatchPaths is adapter.PatchPaths, kept here for the tests that pin Codex's
// envelope.
func PatchPaths(patch string) []string { return adapter.PatchPaths(patch) }

type decision struct {
	HookSpecificOutput struct {
		HookEventName            string `json:"hookEventName"`
		PermissionDecision       string `json:"permissionDecision"`
		PermissionDecisionReason string `json:"permissionDecisionReason"`
	} `json:"hookSpecificOutput"`
}

// Respond writes a denial, and nothing otherwise. Codex requires a non-empty
// reason on a deny, and ignores a deny without one.
func (codexAdapter) Respond(ev adapter.Event, v adapter.Verdict, stdout io.Writer) int {
	if ev.Kind != adapter.KindPreTool || !v.Deny {
		return 0
	}
	var d decision
	d.HookSpecificOutput.HookEventName = "PreToolUse"
	d.HookSpecificOutput.PermissionDecision = "deny"
	d.HookSpecificOutput.PermissionDecisionReason = v.Reason
	if strings.TrimSpace(v.Reason) == "" {
		d.HookSpecificOutput.PermissionDecisionReason = "vaultysclaw: refused"
	}
	if err := json.NewEncoder(stdout).Encode(d); err != nil {
		// Exit 2 blocks in Codex only with a non-empty stderr; the hook
		// package writes the reason there on this path.
		return 2
	}
	return 0
}
