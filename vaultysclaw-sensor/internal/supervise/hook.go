package supervise

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"time"
)

// The hook shim: the tiny process a harness executes before running a tool. It
// translates that harness's own hook protocol into a Request, asks the resident
// daemon over the unix socket, and translates the Response back.
//
// Everything harness-specific in this package lives in this file, and it is the
// only file a second harness's support needs to touch — the daemon, the mapper
// and the decider never learn which harness they are governing.

// hookDialTimeout bounds how long the shim waits for the daemon. It is short on
// purpose: this runs before every tool call, and a hung supervisor must not look
// like a hung agent.
const hookDialTimeout = 2 * time.Second

// ClaudeHookInput is the PreToolUse payload Claude Code writes to the hook's
// stdin. Only the fields this shim uses are declared; unknown fields are ignored
// so a harness upgrade that adds one cannot break the gate.
type ClaudeHookInput struct {
	SessionID     string          `json:"session_id"`
	Cwd           string          `json:"cwd"`
	HookEventName string          `json:"hook_event_name"`
	ToolName      string          `json:"tool_name"`
	ToolInput     json.RawMessage `json:"tool_input"`
}

// ClaudeHookOutput is the decision Claude Code reads from the hook's stdout.
//
// The reason string reaches the model's context, which is the point: a bare
// failure makes an agent retry-loop, a reasoned refusal makes it route around.
type ClaudeHookOutput struct {
	HookSpecificOutput ClaudeHookDecision `json:"hookSpecificOutput"`
}

// ClaudeHookDecision carries the verdict. "allow" and "deny" are terminal;
// this shim never emits "ask", because an interactive prompt is phase 4's
// `assist` mode and pretending to have it would make a governed refusal look
// like an ordinary permission question.
type ClaudeHookDecision struct {
	HookEventName            string `json:"hookEventName"`
	PermissionDecision       string `json:"permissionDecision"`
	PermissionDecisionReason string `json:"permissionDecisionReason,omitempty"`
}

// RunClaudeHook reads one PreToolUse payload from in, asks the daemon at
// socketPath, and writes the decision to out.
//
// **It fails open on every transport error** — a daemon that is not running, a
// socket that has gone away, a timeout — and says so in the reason. That is the
// opposite of the daemon's own posture, and deliberately so: the shim is not a
// security boundary and cannot be one, because anything able to stop the daemon
// can equally well remove the hook that calls it. Making a broken supervisor
// wedge the harness would buy no safety and would guarantee the first thing an
// operator does about it is turn the supervisor off. What it must never do is
// fail open *silently*, so the reason travels with the pass and the exit code
// stays 0 only because a non-zero one would be read as a denial.
func RunClaudeHook(socketPath string, in io.Reader, out io.Writer) error {
	var payload ClaudeHookInput
	if err := json.NewDecoder(in).Decode(&payload); err != nil {
		return writeClaudeDecision(out, "allow", "vaultysclaw: passing — the hook payload could not be parsed: "+err.Error())
	}

	resp, err := Ask(socketPath, Request{
		Tool:    payload.ToolName,
		Input:   payload.ToolInput,
		Cwd:     payload.Cwd,
		Session: payload.SessionID,
	})
	if err != nil {
		return writeClaudeDecision(out, "allow", "vaultysclaw: passing ungoverned — "+err.Error())
	}

	if resp.Allowed {
		// An allow carries no reason: Claude Code surfaces it, and narrating
		// every permitted tool call would bury the refusals that matter.
		return writeClaudeDecision(out, "allow", "")
	}
	return writeClaudeDecision(out, "deny", "vaultysclaw: "+resp.Reason)
}

func writeClaudeDecision(out io.Writer, decision, reason string) error {
	return json.NewEncoder(out).Encode(ClaudeHookOutput{
		HookSpecificOutput: ClaudeHookDecision{
			HookEventName:            "PreToolUse",
			PermissionDecision:       decision,
			PermissionDecisionReason: reason,
		},
	})
}

// Ask sends one request to the daemon and returns its decision. Exported
// because a second harness's shim needs exactly this and nothing else.
func Ask(socketPath string, req Request) (Response, error) {
	conn, err := net.DialTimeout("unix", socketPath, hookDialTimeout)
	if err != nil {
		return Response{}, fmt.Errorf("the vaultysclaw supervisor is not reachable at %s: %w", socketPath, err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(hookDialTimeout))

	line, err := json.Marshal(req)
	if err != nil {
		return Response{}, fmt.Errorf("encoding the decision request: %w", err)
	}
	if _, err := conn.Write(append(line, '\n')); err != nil {
		return Response{}, fmt.Errorf("sending the decision request: %w", err)
	}

	var resp Response
	reader := bufio.NewReader(conn)
	if err := json.NewDecoder(reader).Decode(&resp); err != nil {
		return Response{}, fmt.Errorf("reading the decision: %w", err)
	}
	return resp, nil
}
