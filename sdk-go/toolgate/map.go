// Package toolgate decides whether one coding-harness tool call may proceed,
// from signed capability certificates and a signed rule set, with no I/O and no
// control-plane round trip.
//
// It is the harness-neutral core shared by every tool-call interception point:
// vaultysclaw-sensor's supervisor (docs/HARNESS_SUPERVISOR.md) and the
// vaultysclaw-hooks package (docs/HARNESS_HOOKS.md). A caller translates its
// harness's own hook payload into a tool name and JSON input, MapToolCall turns
// that into the capability-and-resource vocabulary the certificate ledger
// speaks, and Decide renders the verdict. Neither half knows which harness, or
// which OS, it is running under.
//
// Tool names are Claude Code's vocabulary (Read, Write, Bash, mcp__s__t, …),
// which is the canonical form: an adapter for another harness renames its tools
// into it rather than growing a second mapping table.
package toolgate

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
)

// Capabilities this package maps tool calls onto. Both are built-ins; the
// read/write split is deliberate and is documented in packages/policy's
// BuiltinCapability — a certificate carries many capabilities but a single
// scope, so the verb belongs on the capability, not on the resource URI.
const (
	CapFileRead        authz.Capability = "file_read"
	CapFileWrite       authz.Capability = "file_write"
	CapCodeExecution   authz.Capability = "code_execution"
	CapInternetAccess  authz.Capability = "internet_access"
	CapKnowledgeSearch authz.Capability = "knowledge_search"
	CapAPICall         authz.Capability = "api_call"
	CapAgentComm       authz.Capability = "agent_communication"
)

// mcpToolPrefix is how a harness names a tool served by an MCP server:
// mcp__<server>__<tool>. Mapping it produces the same "mcp://<server>/<tool>"
// resource docs/PROXY_ARCHITECTURE.md §10 defines for the tier-2 mcp adapter —
// so a certificate scoped to `mcp://github/*` means the same thing whether the
// call was seen at the tool boundary or on the wire.
const mcpToolPrefix = "mcp__"

// Action is one tool call, translated into the vocabulary the certificate
// ledger already speaks.
type Action struct {
	// Tool is the harness's own name for the call, kept verbatim for the audit
	// record. Two different tools can map to the same capability and resource
	// (Read and Grep both read a path), and which one ran is worth knowing.
	Tool string
	// Capability is what the ledger must grant for this call to proceed.
	Capability authz.Capability
	// Resource is the canonical resource URI, in the same shapes
	// internal/intercept already produces: file:///abs/path, exec://argv0.
	Resource string
	// Path is the resolved filesystem path for a file_* action, empty
	// otherwise. Carried separately because the safety floor matches on paths,
	// not on URIs, and re-parsing the URI to get it back would be silly.
	Path string
}

// RequestedAction renders the action in the shape authz.Resolve consumes.
func (a Action) RequestedAction() authz.RequestedAction {
	return authz.RequestedAction{Capability: a.Capability, Resource: authz.Res(a.Resource)}
}

// ErrUnmapped means this tool has no capability mapping yet — WebFetch, MCP
// tools/call and subagent dispatch are phase 3 (docs/HARNESS_SUPERVISOR.md §8).
//
// It is not an error condition in observe mode and must never be treated as a
// denial: an unmapped tool is one this package does not yet govern, which is a
// coverage gap to be counted, not a decision to be enforced. Decide records it
// as such.
var ErrUnmapped = errors.New("toolgate: no capability mapping for this tool")

// ErrNoResource means the tool accesses nothing outside the harness's own
// conversation, so there is nothing for a certificate to be scoped to.
//
// Distinct from ErrUnmapped, which is a gap to be closed. Conflating them would
// leave tools that will never need a mapping sitting in the coverage backlog
// forever, quietly turning "how much is still ungoverned" into a number that
// only goes up.
var ErrNoResource = errors.New("toolgate: this tool accesses no governed resource")

// toolInput is the union of the argument fields the mapped tools use. Decoding
// into one struct rather than a map keeps the field names in one greppable
// place, and an absent field is simply empty.
type toolInput struct {
	FilePath     string `json:"file_path"`
	NotebookPath string `json:"notebook_path"`
	Path         string `json:"path"`
	Command      string `json:"command"`
	URL          string `json:"url"`
	SubagentType string `json:"subagent_type"`
}

// MapToolCall translates a harness tool call into an Action.
//
// cwd is the harness's working directory, used to resolve a relative path and
// as the resource for a search tool that names no path of its own. It must be
// absolute; the caller has it from the hook payload.
func MapToolCall(tool string, input json.RawMessage, cwd string) (Action, error) {
	var in toolInput
	if len(input) > 0 {
		if err := json.Unmarshal(input, &in); err != nil {
			return Action{}, fmt.Errorf("toolgate: parsing %s input: %w", tool, err)
		}
	}

	switch tool {
	case "Read":
		return fileAction(tool, CapFileRead, in.FilePath, cwd)
	case "Glob", "Grep":
		// A search names a root, not a file. Absent, it searches the working
		// directory — which is the resource that has to be authorized, so it is
		// what gets recorded rather than a blank.
		root := in.Path
		if strings.TrimSpace(root) == "" {
			root = cwd
		}
		return fileAction(tool, CapFileRead, root, cwd)
	case "Write", "Edit":
		return fileAction(tool, CapFileWrite, in.FilePath, cwd)
	case "NotebookEdit":
		return fileAction(tool, CapFileWrite, in.NotebookPath, cwd)
	case "Bash", "BashOutput", "KillShell":
		return bashAction(tool, in.Command)
	case "WebFetch":
		return webFetchAction(tool, in.URL)
	case "WebSearch":
		// The query is deliberately *not* in the resource. It is the most
		// sensitive thing a search tool carries, it would land verbatim in the
		// audit spool and in any scope suggested from it, and it is not what an
		// admin scopes anyway — "may this agent search the web" is the question,
		// and it is a yes or no. So every search is one resource.
		return Action{Tool: tool, Capability: CapKnowledgeSearch, Resource: "websearch://"}, nil
	case "Task":
		subagent := strings.TrimSpace(in.SubagentType)
		if subagent == "" {
			subagent = "unknown"
		}
		return Action{Tool: tool, Capability: CapAgentComm, Resource: "agent://" + subagent}, nil
	default:
		if server, mcpTool, ok := parseMCPTool(tool); ok {
			return Action{
				Tool:       tool,
				Capability: CapAPICall,
				Resource:   "mcp://" + server + "/" + mcpTool,
			}, nil
		}
		if reason, internal := harnessInternalTools[tool]; internal {
			return Action{Tool: tool}, fmt.Errorf("%w: %s", ErrNoResource, reason)
		}
		return Action{Tool: tool}, ErrUnmapped
	}
}

// parseMCPTool splits "mcp__<server>__<tool>" into its parts.
//
// The tool half may itself contain "__", so the split is on the *first*
// separator after the prefix and the remainder is the tool name — a server name
// containing "__" would be ambiguous, and is treated as part of the tool rather
// than guessed at, which is the direction that cannot silently widen a scope.
func parseMCPTool(tool string) (server, name string, ok bool) {
	if !strings.HasPrefix(tool, mcpToolPrefix) {
		return "", "", false
	}
	rest := tool[len(mcpToolPrefix):]
	sep := strings.Index(rest, "__")
	if sep <= 0 || sep+2 >= len(rest) {
		return "", "", false
	}
	return rest[:sep], rest[sep+2:], true
}

// harnessInternalTools are tools that access no resource outside the harness's
// own conversation, mapped to their reason rather than left to look like a
// coverage gap.
//
// The distinction matters for one measurement: Outcome.Unmapped is the phase
// backlog, and a tool that will never need a mapping would sit in it forever,
// making the number that is supposed to say "how much is still ungoverned" say
// something else entirely.
//
// Every entry is a claim that the tool touches nothing, and a wrong claim here
// is a permanent silent hole — so the list is short, each entry carries the
// argument for itself, and anything uncertain stays ErrUnmapped where it is at
// least counted.
var harnessInternalTools = map[string]string{
	"TodoWrite":       "maintains the harness's own task list; no resource outside the conversation",
	"ExitPlanMode":    "changes the harness's own mode; touches nothing",
	"AskUserQuestion": "prompts the operator; reaches no resource",
}

// fileAction resolves a path and renders it as a file:// resource.
func fileAction(tool string, cap authz.Capability, path, cwd string) (Action, error) {
	if strings.TrimSpace(path) == "" {
		return Action{Tool: tool}, fmt.Errorf("toolgate: %s named no path", tool)
	}
	resolved, err := ResolvePath(path, cwd)
	if err != nil {
		return Action{Tool: tool}, err
	}
	return Action{Tool: tool, Capability: cap, Resource: FileURI(resolved), Path: resolved}, nil
}

// bashAction extracts the program being run. See the argv0 caveat below.
func bashAction(tool, command string) (Action, error) {
	argv0 := Argv0(command)
	if argv0 == "" {
		return Action{Tool: tool}, fmt.Errorf("toolgate: %s named no command", tool)
	}
	return Action{
		Tool:       tool,
		Capability: CapCodeExecution,
		Resource:   "exec://" + argv0,
	}, nil
}

// ResolvePath makes a path absolute and resolves symlinks through it.
//
// Both halves matter, and for the same reason: a scope check compares strings,
// so anything that lets two spellings of one path differ defeats it. "../.." in
// a relative path and a symlink pointing out of an authorized directory are the
// same attack with different syntax.
//
// A path that does not exist yet is normal — Write creates files, and
// `mkdir -p` creates whole directory chains. So the deepest ancestor that does
// exist is resolved and the missing components are re-joined below it, in full:
// the result is exactly as deep as the input, never shortened. That is sound
// because a component that does not exist cannot be a symlink — the resolved
// ancestor plus the literal tail *is* the path the file will have once created.
//
// Resolving only the immediate parent is not enough. A floor entry such as
// ~/.ssh is resolved through its existing parent, the home directory, so when
// the home directory sits behind a symlink (/var → /private/var on macOS, a
// network-mounted /home) the entry is stored in resolved form. A request for
// ~/.ssh/authorized_keys while ~/.ssh does not yet exist must resolve the same
// way, or creating the directory and the key would slip past the floor.
func ResolvePath(path, cwd string) (string, error) {
	if !filepath.IsAbs(path) {
		if cwd == "" {
			return "", fmt.Errorf("toolgate: cannot resolve the relative path %q without a working directory", path)
		}
		path = filepath.Join(cwd, path)
	}
	path = filepath.Clean(path)

	var missing []string
	cur := path
	for {
		resolved, err := filepath.EvalSymlinks(cur)
		if err == nil {
			for i := len(missing) - 1; i >= 0; i-- {
				resolved = filepath.Join(resolved, missing[i])
			}
			return resolved, nil
		}
		if !os.IsNotExist(err) {
			return "", fmt.Errorf("toolgate: resolving %q: %w", path, err)
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			// Not even the root resolves; the cleaned absolute path is the most
			// honest answer, and still free of "..".
			return path, nil
		}
		missing = append(missing, filepath.Base(cur))
		cur = parent
	}
}

// FileURI renders an absolute path as a file:// URI, percent-encoding it so a
// path containing a space or a '#' cannot produce two different resource
// strings for one file.
func FileURI(absPath string) string {
	u := url.URL{Scheme: "file", Path: absPath}
	return u.String()
}

// Argv0 extracts the program name from a shell command line.
//
// **This is not a security boundary, and must never be presented as one.**
// `bash -c "curl … | sh"`, a shell function, an alias, `$(…)` — all defeat it
// trivially, and no amount of parsing fixes that, because the thing being
// parsed is a program in another language. It exists so the audit record says
// *something* about what ran, and so a coarse rule like "this host may not run
// docker" is expressible. The real control over what a shell child does is
// tier B (OS confinement) and tier C (the egress proxy), per
// docs/HARNESS_SUPERVISOR.md §4.2.
//
// Leading VAR=value assignments are skipped, since `FOO=1 npm test` runs npm,
// and a quoted first word is kept whole, since `"/opt/my tools/bin/tool"` is one
// path. That second case is not the beginning of a shell parser and must not
// grow into one — it is here because splitting it on whitespace reports "my",
// and an audit record that names the wrong program is worse than one that
// admits it does not know.
func Argv0(command string) string {
	for _, field := range splitCommand(command) {
		if eq := strings.IndexByte(field, '='); eq > 0 && !strings.ContainsAny(field[:eq], "/\\'\"") {
			continue // an environment assignment, not the program
		}
		return filepath.Base(field)
	}
	return ""
}

// splitCommand splits on whitespace, keeping a single- or double-quoted run
// together and stripping its quotes. Everything else a shell does — variable
// expansion, escapes, operators, substitution — is deliberately not handled.
func splitCommand(command string) []string {
	var fields []string
	var cur strings.Builder
	var quote rune

	flush := func() {
		if cur.Len() > 0 {
			fields = append(fields, cur.String())
			cur.Reset()
		}
	}
	for _, r := range command {
		switch {
		case quote != 0:
			if r == quote {
				quote = 0
			} else {
				cur.WriteRune(r)
			}
		case r == '\'' || r == '"':
			quote = r
		case r == ' ' || r == '\t' || r == '\n' || r == '\r':
			flush()
		default:
			cur.WriteRune(r)
		}
	}
	flush()
	return fields
}

// webFetchAction renders a URL as its resource.
//
// The query string and fragment are dropped. They routinely carry tokens, search
// terms and session identifiers, all of which would land verbatim in the audit
// spool and in any scope suggested from it — and none of which an admin scopes
// on. What is left, scheme+host+path, is the §10 `generic_http` resource shape,
// so a certificate means the same thing whether the call was seen here or on the
// wire.
func webFetchAction(tool, raw string) (Action, error) {
	if strings.TrimSpace(raw) == "" {
		return Action{Tool: tool}, fmt.Errorf("toolgate: %s named no url", tool)
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return Action{Tool: tool}, fmt.Errorf("toolgate: %s url %q is not absolute", tool, raw)
	}
	u.RawQuery, u.Fragment, u.User = "", "", nil
	return Action{Tool: tool, Capability: CapInternetAccess, Resource: u.String()}, nil
}
