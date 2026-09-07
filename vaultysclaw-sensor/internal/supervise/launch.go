package supervise

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// Harness is a supported coding harness. The value names which shim translation
// and which config injection to use; everything downstream of the shim is
// harness-neutral.
type Harness string

const (
	// HarnessClaudeCode is governed at tier A through a PreToolUse hook.
	HarnessClaudeCode Harness = "claude-code"
)

// LaunchOptions is everything needed to start a governed harness.
type LaunchOptions struct {
	Harness Harness
	// Command is the harness executable and the operator's own arguments. The
	// supervisor's injected arguments are prepended to the operator's, so an
	// explicit --settings from the operator still wins on the harness's own
	// last-flag-wins terms.
	Command []string
	// SocketPath is where the resident daemon is listening.
	SocketPath string
	// SelfPath is this binary's absolute path, used as the hook command. Taken
	// from the caller rather than os.Executable() here so a test can supply one.
	SelfPath string
	// SettingsPath is where the generated harness settings file is written. It
	// belongs to the supervisor, not to the user's project.
	SettingsPath string
	// Dir is the working directory for the harness. Empty inherits.
	Dir string
	// Sandbox, when non-nil, confines the harness (tier B). Nil means tier A
	// only, which is advisory — see AdvisoryNotice.
	Sandbox *Sandbox
}

// claudeSettings is the minimal settings document this launcher generates. It
// is written fresh every launch and passed with --settings, which is additive:
// the user's own settings still apply, and this file adds one hook to them.
//
// Deliberately not a merge into the user's ~/.claude/settings.json or the
// project's .claude/settings.json. Editing a file the user owns to install
// enforcement is how a supervisor ends up silently disabled by a later edit
// nobody connected to it, and it makes uninstalling ambiguous.
type claudeSettings struct {
	Hooks map[string][]claudeHookMatcher `json:"hooks"`
}

type claudeHookMatcher struct {
	Matcher string            `json:"matcher"`
	Hooks   []claudeHookEntry `json:"hooks"`
}

type claudeHookEntry struct {
	Type    string `json:"type"`
	Command string `json:"command"`
	Timeout int    `json:"timeout,omitempty"`
}

// WriteClaudeSettings generates the settings file that installs the PreToolUse
// hook, and returns its path.
//
// The matcher is "*": every tool is submitted for a decision, including the ones
// MapToolCall does not map yet. That is the point of observe mode — an unmapped
// tool is recorded as a coverage gap (Outcome.Unmapped), and a gap that is never
// submitted is a gap nobody can count.
func WriteClaudeSettings(path, selfPath, socketPath string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("supervise: preparing the settings directory: %w", err)
	}
	settings := claudeSettings{
		Hooks: map[string][]claudeHookMatcher{
			"PreToolUse": {{
				Matcher: "*",
				Hooks: []claudeHookEntry{{
					Type: "command",
					// %q so a path containing a space cannot split into two
					// arguments and silently install a hook that never runs.
					Command: fmt.Sprintf("%q hook --socket %q", selfPath, socketPath),
					// Seconds. Comfortably above the shim's own 2s dial timeout,
					// so a slow decision is reported by the shim (which fails
					// open loudly) rather than killed by the harness (which
					// would not say why).
					Timeout: 10,
				}},
			}},
		},
	}
	body, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, append(body, '\n'), 0o600); err != nil {
		return fmt.Errorf("supervise: writing %s: %w", path, err)
	}
	return nil
}

// Preflight refuses to launch unless the gate is actually in place.
//
// The same fatal-not-degraded posture startIntercept takes: a harness running
// with a hook that silently never fires is indistinguishable at a glance from a
// governed one, and an operator who believes they are supervising something must
// not be quietly wrong. Every check here is one that has a failure mode ending in
// "and then nothing was governed".
func Preflight(opts LaunchOptions) error {
	if len(opts.Command) == 0 {
		return fmt.Errorf("supervise: no harness command given")
	}
	if opts.Harness != HarnessClaudeCode {
		return fmt.Errorf("supervise: harness %q is not supported yet — only %q has a tier-A hook today", opts.Harness, HarnessClaudeCode)
	}
	if _, err := exec.LookPath(opts.Command[0]); err != nil {
		return fmt.Errorf("supervise: %s is not executable: %w", opts.Command[0], err)
	}
	// The hook command must exist and be executable *as written into the
	// settings file*, or every tool call fails open.
	info, err := os.Stat(opts.SelfPath)
	if err != nil {
		return fmt.Errorf("supervise: the hook binary %s is not present: %w", opts.SelfPath, err)
	}
	if info.Mode().Perm()&0o111 == 0 {
		return fmt.Errorf("supervise: the hook binary %s is not executable", opts.SelfPath)
	}
	if _, err := os.Stat(opts.SocketPath); err != nil {
		return fmt.Errorf("supervise: the decision socket %s is not listening: %w", opts.SocketPath, err)
	}
	// A last check through the real path: if this does not get a decision, no
	// tool call will either.
	if _, err := Ask(opts.SocketPath, Request{Tool: "preflight", Cwd: opts.Dir, Probe: true}); err != nil {
		return fmt.Errorf("supervise: the decision socket did not answer: %w", err)
	}
	return nil
}

// BuildLaunch prepares the harness command, writing the settings file first.
//
// It does not run anything — the caller owns the process lifecycle — so that the
// settings generation and argument construction are testable without spawning a
// coding agent.
func BuildLaunch(ctx context.Context, opts LaunchOptions) (*exec.Cmd, error) {
	if err := WriteClaudeSettings(opts.SettingsPath, opts.SelfPath, opts.SocketPath); err != nil {
		return nil, err
	}
	if err := Preflight(opts); err != nil {
		return nil, err
	}

	// Resolved here, not left for the child to look up again.
	//
	// sandbox-exec execs its target with execvp, which re-resolves the name
	// against PATH in an environment it has already filtered — and that lookup
	// can fail for a command this process found perfectly well, which is how
	// `claude` ended up as "No such file or directory" on a host where it is on
	// PATH. Preflight already called LookPath to validate; using its answer
	// means the binary that was checked is the binary that runs, with no second
	// resolution to disagree with the first.
	resolved, err := exec.LookPath(opts.Command[0])
	if err != nil {
		return nil, fmt.Errorf("supervise: %s is not executable: %w", opts.Command[0], err)
	}
	argv := append([]string{resolved, "--settings", opts.SettingsPath}, opts.Command[1:]...)
	if opts.Sandbox != nil {
		// Confinement wraps the whole harness, so everything it spawns inherits
		// it. That is the property tier A cannot have: a `bash -c` child is
		// outside the hook but inside the sandbox.
		argv = opts.Sandbox.Wrap(argv)
	}
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	cmd.Dir = opts.Dir
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	cmd.Env = append(os.Environ(),
		"VAULTYSCLAW_SUPERVISE_SOCKET="+opts.SocketPath,
	)
	return cmd, nil
}

// AdvisoryNotice is what an operator must be told when tier B is not in force —
// see docs/HARNESS_SUPERVISOR.md §7. It is not decoration: without confinement,
// the agent can edit the settings file that installs the hook, and anything it
// starts through Bash is outside the hook entirely.
const AdvisoryNotice = "supervision is ADVISORY: the hook governs tool calls the harness routes through it, " +
	"but nothing prevents a subprocess or an edited harness config from bypassing it. " +
	"OS confinement (tier B) is not in force."

// ConfinedNotice is what replaces it when tier B is in force — and it is
// deliberately still a qualified claim. The floor and this supervisor's own
// artefacts are kernel-enforced; everything else the harness does is governed by
// the hook alone, and the hook remains bypassable by a subprocess. Overstating
// this would undo the reason the advisory notice exists.
const ConfinedNotice = "OS confinement is in force for the safety floor and this supervisor's own artefacts — " +
	"those hold against a subprocess or an edited harness config. Everything else is still hook-governed only: " +
	"the profile is a deny-list, not general confinement."
