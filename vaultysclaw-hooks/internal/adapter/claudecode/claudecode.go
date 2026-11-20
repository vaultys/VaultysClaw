// Package claudecode adapts Claude Code's hook protocol.
//
// Claude Code's tool names are already toolgate's canonical vocabulary, so this
// adapter renames nothing. It is the reference for every other adapter: parse
// the payload, classify the event, and on a denial write the one JSON shape the
// harness reads.
package claudecode

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter"
)

// Vendor is the canonical key used in installed hook commands.
const Vendor = "claude-code"

// Events are the hook events vaultysclaw-hooks registers in Claude Code's
// settings. PreToolUse decides; the rest feed the audit trail.
var Events = []string{
	"PreToolUse",
	"PostToolUse",
	"UserPromptSubmit",
	"SessionStart",
	"SessionEnd",
	"Stop",
	"SubagentStop",
}

// ToolMatcherEvents are the events Claude Code filters by tool name, and so
// need a matcher in their settings entry.
var ToolMatcherEvents = map[string]bool{"PreToolUse": true, "PostToolUse": true}

type claudeAdapter struct{}

func init() { adapter.Register(claudeAdapter{}, "cc", "claude", "claudecode") }

func (claudeAdapter) Vendor() string { return Vendor }

func (claudeAdapter) Kind(event string) adapter.Kind {
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
	default:
		return adapter.KindOther
	}
}

// payload declares only the fields this adapter uses. Unknown fields are
// ignored, so a Claude Code release that adds one cannot break the gate.
type payload struct {
	SessionID     string          `json:"session_id"`
	Cwd           string          `json:"cwd"`
	HookEventName string          `json:"hook_event_name"`
	ToolName      string          `json:"tool_name"`
	ToolInput     json.RawMessage `json:"tool_input"`
}

func (a claudeAdapter) Parse(event string, raw []byte) (adapter.Event, error) {
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		return adapter.Event{}, fmt.Errorf("claude-code: parsing %s payload: %w", event, err)
	}
	// The payload names its own event; the --event flag is the fallback, and
	// the payload wins when they disagree because it is what actually fired.
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
	if ev.Kind == adapter.KindPreTool && ev.Tool == "" {
		return ev, fmt.Errorf("claude-code: PreToolUse payload names no tool")
	}
	return ev, nil
}

// decision is the PreToolUse answer Claude Code reads from stdout.
type decision struct {
	HookSpecificOutput struct {
		HookEventName            string `json:"hookEventName"`
		PermissionDecision       string `json:"permissionDecision"`
		PermissionDecisionReason string `json:"permissionDecisionReason,omitempty"`
	} `json:"hookSpecificOutput"`
}

// Respond writes a denial, and nothing otherwise.
//
// Nothing — not "allow". In Claude Code a PreToolUse "allow" bypasses the
// permission system, so emitting it for every call the certificate permits
// would silently remove the user's own approval prompts. Staying silent leaves
// the harness's normal flow in charge of everything this package does not
// refuse.
func (claudeAdapter) Respond(ev adapter.Event, v adapter.Verdict, stdout io.Writer) int {
	if ev.Kind != adapter.KindPreTool || !v.Deny {
		return 0
	}
	var d decision
	d.HookSpecificOutput.HookEventName = "PreToolUse"
	d.HookSpecificOutput.PermissionDecision = "deny"
	d.HookSpecificOutput.PermissionDecisionReason = v.Reason
	if err := json.NewEncoder(stdout).Encode(d); err != nil {
		// stdout is gone, so the JSON channel is unusable. Exit code 2 is
		// Claude Code's other blocking channel: it refuses the call and feeds
		// stderr to the model.
		return 2
	}
	return 0
}
