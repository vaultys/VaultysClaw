// Package adapter is the only harness-specific layer of vaultysclaw-hooks.
//
// Each supported harness gets one Adapter: it parses that harness's hook
// payload into a normalised Event, and writes a Verdict back in the format the
// harness reads. Everything downstream — mapping, the decision, the audit
// trail — is harness-neutral and lives in sdk-go/toolgate and internal/hook.
//
// Tool names in an Event are always toolgate's canonical vocabulary (Claude
// Code's: Read, Write, Bash, mcp__server__tool, …). An adapter for a harness
// that names its tools differently renames them here, so there is exactly one
// capability mapping table in the codebase.
package adapter

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
)

// Kind is what an event means, independent of what the harness calls it.
type Kind string

const (
	// KindPreTool is the decision point: a tool is about to run.
	KindPreTool Kind = "pre_tool"
	// KindPostTool reports a tool that has run. Audit only.
	KindPostTool Kind = "post_tool"
	// KindPrompt is a user prompt about to be submitted. Audit only for now.
	KindPrompt Kind = "prompt"
	// KindSessionStart and KindSessionEnd bracket a session. Audit only.
	KindSessionStart Kind = "session_start"
	KindSessionEnd   Kind = "session_end"
	// KindStop is the agent (or a subagent) finishing a turn. Audit only.
	KindStop Kind = "stop"
	// KindOther is any event this package records but does not interpret.
	KindOther Kind = "other"
)

// Event is one hook invocation, normalised.
type Event struct {
	Vendor   string
	Kind     Kind
	RawEvent string
	Session  string
	Cwd      string
	// Tool is the canonical (toolgate) tool name; VendorTool is what the
	// harness actually called it, kept for the audit record.
	Tool       string
	VendorTool string
	// Input is the tool's arguments, verbatim. It is handed to the mapper and
	// never written to the audit trail: arguments routinely carry file
	// contents, secrets and prompts.
	Input json.RawMessage
	// More are further calls the same invocation makes — one apply_patch
	// touching three files is three file writes. Each is decided like the first,
	// and the invocation is refused if any of them is.
	More []Call
}

// Call is one tool call in canonical form.
type Call struct {
	Tool  string
	Input json.RawMessage
}

// ErrDeferred, returned by Parse, means another event the harness fires for
// the same action makes the decision — for example because only that event
// names the MCP server. It is not a parse failure: the invocation is recorded
// and answered with no objection, in enforce mode too.
var ErrDeferred = errors.New("adapter: decided by another event")

// Verdict is the answer to a KindPreTool event.
type Verdict struct {
	// Deny blocks the tool call. False means "no objection", which an adapter
	// must render as *no opinion* — never as an explicit allow — so the
	// harness's own permission flow still runs. An explicit allow would turn
	// this package into a way of skipping the user's permission prompts.
	Deny bool
	// Reason reaches the model's context on a denial, which is the point: a
	// reasoned refusal makes an agent route around, a bare one makes it retry.
	Reason string
}

// Adapter translates one harness's hook protocol.
type Adapter interface {
	// Vendor is the canonical vendor key, used in installed hook commands and
	// in the audit trail.
	Vendor() string
	// Kind classifies a raw event name without needing the payload, so a
	// payload that fails to parse can still be recognised as a decision point
	// (and refused in enforce mode) rather than waved through.
	Kind(event string) Kind
	// Parse reads one payload. event is the --event flag the installed hook
	// passed, which some harnesses do not repeat inside the payload.
	Parse(event string, payload []byte) (Event, error)
	// Respond writes the harness's answer to stdout and returns the process
	// exit code. It is called for every event; for anything but KindPreTool,
	// and for a non-denying verdict, it must write nothing the harness would
	// act on.
	Respond(ev Event, v Verdict, stdout io.Writer) int
}

var (
	mu       sync.RWMutex
	registry = map[string]Adapter{}
)

// Register makes an adapter available under its vendor key and any aliases.
// Called from each adapter package's init.
func Register(a Adapter, aliases ...string) {
	mu.Lock()
	defer mu.Unlock()
	for _, key := range append([]string{a.Vendor()}, aliases...) {
		registry[strings.ToLower(key)] = a
	}
}

// Lookup returns the adapter for a vendor key or alias.
func Lookup(vendor string) (Adapter, error) {
	mu.RLock()
	defer mu.RUnlock()
	if a, ok := registry[strings.ToLower(strings.TrimSpace(vendor))]; ok {
		return a, nil
	}
	return nil, fmt.Errorf("adapter: unknown vendor %q (known: %s)", vendor, strings.Join(vendorsLocked(), ", "))
}

// Vendors lists the canonical vendor keys, sorted.
func Vendors() []string {
	mu.RLock()
	defer mu.RUnlock()
	return vendorsLocked()
}

func vendorsLocked() []string {
	seen := map[string]bool{}
	var out []string
	for _, a := range registry {
		if !seen[a.Vendor()] {
			seen[a.Vendor()] = true
			out = append(out, a.Vendor())
		}
	}
	sort.Strings(out)
	return out
}
