package supervise

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Tier B, via Anthropic's sandbox-runtime (`srt`).
//
// # Why an external tool rather than a profile per platform
//
// The mechanisms this needs — a seatbelt profile on macOS, bubblewrap plus
// seccomp on Linux, ACLs for a dedicated SID plus a WFP egress fence on Windows
// — are exactly the three docs/HARNESS_SUPERVISOR.md §6 specifies, and srt
// implements all three behind one configuration format. Writing them here would
// mean maintaining three backends, two of which this project has no way to test
// on every change, to arrive at what an Apache-2.0 dependency already does.
//
// The trade is a Node runtime on the host and a research-preview dependency
// (`anthropic-experimental/sandbox-runtime`; Windows is alpha). That is
// acceptable *because the failure mode is loud*: srt missing means
// ErrSandboxUnavailable, which `sandbox: require` turns into a refusal to
// launch. The one thing this must never do is look confined while it is not.
//
// # Polarity
//
// srt's read model is deny-then-allow — reads are permitted everywhere and
// `denyRead` carves holes — which is the polarity the floor and every signed
// `deny file://…` rule already have, so the translation is direct rather than an
// inversion. Writes are the other way round (`allowWrite` grants, `denyWrite`
// overrides), so preserving this project's "writes permitted except where
// denied" means granting "/" and letting the denies win, which is what they do.

// srtBinary is the CLI this backend drives. Found on PATH so a host can install
// it however it likes (npm -g, pnpm, a wrapper script).
const srtBinary = "srt"

// SRTPathEnv overrides the lookup, for a host that installs srt somewhere not on
// the supervisor's PATH — a launchd-started supervisor inherits almost none.
const SRTPathEnv = "VAULTYSCLAW_SRT_PATH"

// srtSettings is the subset of srt's configuration this project generates.
//
// Every field is emitted, including empty ones: srt validates with a schema that
// requires `network`, `allowedDomains` and `deniedDomains`, and refuses to fall
// back to a default configuration when validation fails. That refusal is a
// feature and the reason the slices below are initialised rather than left nil —
// a nil slice marshals to `null`, which is not the empty array the schema wants.
type srtSettings struct {
	Filesystem srtFilesystem `json:"filesystem"`
	Network    srtNetwork    `json:"network"`
}

type srtFilesystem struct {
	DenyRead   []string `json:"denyRead"`
	AllowRead  []string `json:"allowRead"`
	AllowWrite []string `json:"allowWrite"`
	DenyWrite  []string `json:"denyWrite"`
}

type srtNetwork struct {
	AllowedDomains []string `json:"allowedDomains"`
	DeniedDomains  []string `json:"deniedDomains"`
}

// BuildSRTSettings renders spec as an srt settings document.
//
// When the certificate carried an `srt` block it is the base, and this merges
// into it rather than replacing it: unknown keys survive untouched, so a field
// this binary has never heard of still reaches srt. What the block cannot do is
// *remove* protection — the floor's denies and this supervisor's own artefacts
// are unioned in afterwards, so a block that omits `~/.ssh` does not un-protect
// it, and one that grants write to everything still cannot make the grant token
// writable. Adding policy must never remove protection, and a signed block is
// policy being added.
//
// Pure, and exported, for the reason BuildProfile was: the mapping from a
// SandboxSpec to what the kernel actually enforces is the part that is wrong
// silently, so it has to be assertable without a sandbox.
func BuildSRTSettings(spec SandboxSpec) ([]byte, error) {
	doc := map[string]any{}
	if len(spec.Base) > 0 {
		if err := json.Unmarshal(spec.Base, &doc); err != nil {
			// Refused rather than ignored: falling back to derived settings
			// would enforce something other than what the admin signed, while
			// reporting confinement as active.
			return nil, fmt.Errorf("supervise: the certificate's srt block is not valid JSON: %w", err)
		}
	}

	fs := subObject(doc, "filesystem")
	net := subObject(doc, "network")

	if len(spec.Base) == 0 {
		// No block: the defaults that preserve this project's own semantics.
		// Reads permitted except where denied; writes likewise, which srt spells
		// as granting "/" and letting denyWrite win.
		fs["allowRead"] = []string{}
		fs["allowWrite"] = []string{"/"}
	}
	// Required by srt's schema whatever the block said, and a nil slice marshals
	// to null, which the schema rejects.
	ensureArray(fs, "allowRead")
	ensureArray(fs, "allowWrite")
	ensureArray(fs, "denyRead")
	ensureArray(fs, "denyWrite")
	ensureArray(net, "deniedDomains")

	// The non-negotiable half.
	fs["denyRead"] = unionStrings(fs["denyRead"], spec.DenyAll)
	fs["denyWrite"] = unionStrings(fs["denyWrite"], append(append([]string{}, spec.DenyAll...), spec.DenyWrite...))
	net["deniedDomains"] = unionStrings(net["deniedDomains"], spec.DeniedDomains)

	if !baseDeclaresNetwork(spec.Base) {
		if spec.NetworkUnrestricted {
			// Caller's bug: NewSandbox rejects this first, and inventing a
			// domain list here would be policy nobody signed.
			return nil, fmt.Errorf("supervise: cannot render settings for an unrestricted network scope")
		}
		net["allowedDomains"] = append([]string{}, spec.AllowedDomains...)
		ensureArray(net, "allowedDomains")
	}

	doc["filesystem"] = fs
	doc["network"] = net
	return json.MarshalIndent(doc, "", "  ")
}

// subObject returns doc[key] as a mutable object, creating it when absent and
// replacing it when the block put something else there — srt would reject a
// non-object anyway, and this keeps the merge total.
func subObject(doc map[string]any, key string) map[string]any {
	if existing, ok := doc[key].(map[string]any); ok {
		return existing
	}
	return map[string]any{}
}

// ensureArray guarantees key holds a JSON array rather than null or nothing.
func ensureArray(obj map[string]any, key string) {
	switch v := obj[key].(type) {
	case []any:
		if v == nil {
			obj[key] = []string{}
		}
	case []string:
		if v == nil {
			obj[key] = []string{}
		}
	default:
		obj[key] = []string{}
	}
}

// unionStrings appends add to whatever existing holds, without duplicates and
// preserving the authored order — the block's own entries stay first, so a
// human reading the generated file sees what they wrote before what was added.
func unionStrings(existing any, add []string) []string {
	out := []string{}
	seen := map[string]bool{}
	appendUnique := func(v string) {
		if v == "" || seen[v] {
			return
		}
		seen[v] = true
		out = append(out, v)
	}

	switch v := existing.(type) {
	case []string:
		for _, e := range v {
			appendUnique(e)
		}
	case []any:
		for _, e := range v {
			if str, ok := e.(string); ok {
				appendUnique(str)
			}
		}
	}
	for _, e := range add {
		appendUnique(e)
	}
	return out
}

// NewSandbox writes the settings, proves srt actually confines with them, and
// returns a wrapper. It refuses rather than degrading, exactly as the seatbelt
// backend it replaces did: a caller that asked for confinement and got a no-op
// must find out here and not from an incident.
func NewSandbox(spec SandboxSpec, dir string) (*Sandbox, error) {
	if spec.NetworkUnrestricted {
		return nil, ErrSandboxUnavailable{
			Why: "the certificate places no limit on network egress, and srt has no way to express that — " +
				"it requires an explicit allowedDomains list and rejects \"*\" as overly broad. " +
				"Scope the certificate's allowed domains in the console, or set supervise.sandbox: auto to run with tier-A governance only",
		}
	}

	bin, err := findSRT()
	if err != nil {
		return nil, err
	}

	settings, err := BuildSRTSettings(spec)
	if err != nil {
		return nil, err
	}

	if err := runSRTCanary(bin, spec, dir); err != nil {
		return nil, err
	}

	// The real settings, written where they survive the canary's cleanup.
	f, err := os.CreateTemp(dir, ".vaultysclaw-srt-*.json")
	if err != nil {
		return nil, fmt.Errorf("supervise: writing the sandbox settings: %w", err)
	}
	path := f.Name()
	if _, err := f.Write(settings); err != nil {
		f.Close()
		os.Remove(path)
		return nil, fmt.Errorf("supervise: writing the sandbox settings: %w", err)
	}
	f.Close()
	// The settings name every denied path, so they are as sensitive as the floor
	// and must not be world-readable.
	if err := os.Chmod(path, 0o600); err != nil {
		os.Remove(path)
		return nil, err
	}

	return &Sandbox{
		Wrap: func(command []string) []string {
			// "--" is load-bearing, not decoration. Without it srt's own option
			// parser keeps reading past the command name and swallows the
			// harness's flags: `claude --settings <hook settings>` gave srt a
			// second --settings, last-wins, and it tried to load Claude Code's
			// hook file as a sandbox configuration and refused to start. The
			// harness's arguments are data to this layer, never options.
			return append([]string{bin, "--settings", path, "--"}, command...)
		},
		Description: fmt.Sprintf(
			"sandbox-runtime (srt) via %s — %d paths denied outright, %d write-protected, %d domains allowed / %d denied",
			bin, len(spec.DenyAll), len(spec.DenyWrite), len(spec.AllowedDomains), len(spec.DeniedDomains)),
		cleanup: func() { os.Remove(path) },
	}, nil
}

// BuildProfile is retained so callers that rendered the old seatbelt profile for
// display keep compiling; srt owns profile generation now.
func BuildProfile(spec SandboxSpec) string {
	out, err := BuildSRTSettings(spec)
	if err != nil {
		return ""
	}
	return string(out)
}

// findSRT locates the CLI, preferring an explicitly configured path.
func findSRT() (string, error) {
	if p := strings.TrimSpace(os.Getenv(SRTPathEnv)); p != "" {
		if _, err := os.Stat(p); err != nil {
			return "", ErrSandboxUnavailable{
				Why: fmt.Sprintf("%s is set to %s, which does not exist", SRTPathEnv, p),
			}
		}
		return p, nil
	}
	bin, err := exec.LookPath(srtBinary)
	if err != nil {
		return "", ErrSandboxUnavailable{
			Why: "sandbox-runtime (srt) is not installed or not on PATH — " +
				"install it with `npm install -g @anthropic-ai/sandbox-runtime`, or set " +
				SRTPathEnv + " to its location",
		}
	}
	return bin, nil
}

// runSRTCanary proves confinement is in force, right now, on this machine.
//
// Inherited wholesale from the seatbelt backend, because the reasoning did not
// change with the mechanism: every way this fails is silent. A settings file
// that validates and denies nothing, an srt build whose platform backend is
// unavailable, a macOS release that changed sandbox-exec underneath it — all of
// them produce a launcher that reports confinement and enforces none.
//
// Both directions are checked. Reading the canary *outside* must succeed, or a
// plain permissions problem would masquerade as working confinement, and reading
// it *inside* must fail. Only the pair proves anything.
func runSRTCanary(bin string, spec SandboxSpec, dir string) error {
	canaryDir, err := os.MkdirTemp(dir, ".vaultysclaw-sandbox-check")
	if err != nil {
		return fmt.Errorf("supervise: preparing the sandbox self-test: %w", err)
	}
	defer os.RemoveAll(canaryDir)

	resolvedDir, err := ResolvePath(canaryDir, "")
	if err != nil {
		return err
	}
	canary := filepath.Join(resolvedDir, "canary")
	if err := os.WriteFile(canary, []byte("canary"), 0o600); err != nil {
		return fmt.Errorf("supervise: preparing the sandbox self-test: %w", err)
	}

	testSpec := spec
	testSpec.DenyAll = append(append([]string{}, spec.DenyAll...), canary)
	settings, err := BuildSRTSettings(testSpec)
	if err != nil {
		return err
	}
	settingsPath := filepath.Join(resolvedDir, "check.json")
	if err := os.WriteFile(settingsPath, settings, 0o600); err != nil {
		return err
	}

	probe := readProbeCommand(canary)
	if err := exec.Command(probe[0], probe[1:]...).Run(); err != nil {
		return fmt.Errorf("supervise: the sandbox self-test is inconclusive — the canary is unreadable even unconfined: %w", err)
	}
	confined := append([]string{"--settings", settingsPath, "--"}, probe...)
	out, err := exec.Command(bin, confined...).CombinedOutput()
	if err == nil {
		return fmt.Errorf(
			"supervise: refusing to launch — srt accepted the settings but did not deny a path they name. "+
				"Confinement is not in force on this machine. Self-test output: %q",
			strings.TrimSpace(string(out)))
	}
	return nil
}
