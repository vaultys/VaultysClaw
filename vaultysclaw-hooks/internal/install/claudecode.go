package install

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter/claudecode"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// claudeCode installs into Claude Code's settings.
//
//   - machine scope: our own drop-in file in the managed-settings.d directory
//     next to managed-settings.json. Managed settings outrank anything a user
//     or project writes, and a drop-in file of our own means install and
//     uninstall never edit a file an MDM profile or another tool owns.
//   - user scope: merged into ~/.claude/settings.json. For trials only — the
//     agent runs as that user and can edit it.
type claudeCode struct{}

func init() { register(claudeCode{}) }

// dropInName sorts late so a drop-in that clears hooks before it cannot
// silently remove ours; it is still worth checking in doctor's output.
const dropInName = "50-vaultysclaw-hooks.json"

// hookTimeoutSeconds bounds one invocation. Signature verification and a file
// read take milliseconds; the margin is for a cold start on a loaded machine.
const hookTimeoutSeconds = 10

func (claudeCode) Vendor() string { return claudecode.Vendor }

// ManagedDir is Claude Code's system settings directory on this OS.
func ManagedDir() string {
	switch runtime.GOOS {
	case "darwin":
		return "/Library/Application Support/ClaudeCode"
	case "windows":
		base := os.Getenv("ProgramFiles")
		if base == "" {
			base = `C:\Program Files`
		}
		return filepath.Join(base, "ClaudeCode")
	default:
		return "/etc/claude-code"
	}
}

func (claudeCode) Target(scope state.Scope) (string, error) {
	if scope == state.ScopeMachine {
		return filepath.Join(ManagedDir(), "managed-settings.d", dropInName), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".claude", "settings.json"), nil
}

func (c claudeCode) Install(o Options) (Result, error) {
	target, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	res := Result{Vendor: c.Vendor(), Target: target}

	var settings map[string]any
	if o.Scope == state.ScopeMachine {
		// Our own file: written whole, nothing to merge.
		settings = map[string]any{}
	} else {
		settings, _, err = readJSONObject(target)
		if err != nil {
			return res, err
		}
	}

	hooks := hooksObject(settings)
	for _, event := range claudecode.Events {
		kept := removeOurs(hooks[event], c.Vendor())
		entry := map[string]any{
			"hooks": []any{map[string]any{
				"type":    "command",
				"command": HookCommand(o, c.Vendor(), event),
				"timeout": hookTimeoutSeconds,
			}},
		}
		if claudecode.ToolMatcherEvents[event] {
			entry["matcher"] = "*"
		}
		hooks[event] = append(kept, entry)
	}
	settings["hooks"] = hooks

	if o.DryRun {
		res.Notes = append(res.Notes, "would write "+target)
		return res, nil
	}
	perm, dirPerm := os.FileMode(0o600), os.FileMode(0o700)
	if o.Scope == state.ScopeMachine {
		perm, dirPerm = 0o644, 0o755
	}
	if err := writeJSONAtomic(target, settings, perm, dirPerm); err != nil {
		return res, err
	}
	res.Changed = true
	if o.Scope == state.ScopeUser {
		res.Notes = append(res.Notes, "user scope: anything running as you, including the agent, can remove this — use --scope=machine to govern")
	}
	return res, nil
}

func (c claudeCode) Uninstall(o Options) (Result, error) {
	target, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	res := Result{Vendor: c.Vendor(), Target: target}

	if o.Scope == state.ScopeMachine {
		if _, err := os.Stat(target); os.IsNotExist(err) {
			return res, nil
		}
		if o.DryRun {
			res.Notes = append(res.Notes, "would remove "+target)
			return res, nil
		}
		if err := os.Remove(target); err != nil {
			return res, err
		}
		res.Changed = true
		return res, nil
	}

	settings, existed, err := readJSONObject(target)
	if err != nil || !existed {
		return res, err
	}
	hooks := hooksObject(settings)
	changed := false
	for event, entries := range hooks {
		before := asSlice(entries)
		kept := removeOurs(entries, c.Vendor())
		if len(kept) != len(before) {
			changed = true
		}
		if len(kept) == 0 {
			delete(hooks, event)
		} else {
			hooks[event] = kept
		}
	}
	if !changed {
		return res, nil
	}
	if len(hooks) == 0 {
		delete(settings, "hooks")
	} else {
		settings["hooks"] = hooks
	}
	if o.DryRun {
		res.Notes = append(res.Notes, "would rewrite "+target)
		return res, nil
	}
	if err := writeJSONAtomic(target, settings, 0o600, 0o700); err != nil {
		return res, err
	}
	res.Changed = true
	return res, nil
}

func (c claudeCode) Check(o Options) Check {
	chk := Check{Vendor: c.Vendor()}
	if p, err := exec.LookPath("claude"); err == nil {
		chk.HarnessFound, chk.HarnessDetail = true, p
	} else if home, err := os.UserHomeDir(); err == nil {
		if _, err := os.Stat(filepath.Join(home, ".claude")); err == nil {
			chk.HarnessFound, chk.HarnessDetail = true, filepath.Join(home, ".claude")
		}
	}

	target, err := c.Target(o.Scope)
	if err != nil {
		chk.Problems = append(chk.Problems, err.Error())
		return chk
	}
	chk.Target = target
	settings, existed, err := readJSONObject(target)
	if err != nil {
		chk.Problems = append(chk.Problems, err.Error())
		return chk
	}
	if !existed {
		chk.Missing = append(chk.Missing, claudecode.Events...)
		return chk
	}
	hooks := hooksObject(settings)
	for _, event := range claudecode.Events {
		cmd := ourCommand(hooks[event], c.Vendor())
		if cmd == "" {
			chk.Missing = append(chk.Missing, event)
			continue
		}
		chk.Installed = append(chk.Installed, event)
		if bin := commandBinary(cmd); bin != "" {
			if _, err := os.Stat(bin); err != nil {
				chk.Problems = append(chk.Problems, fmt.Sprintf("%s hook runs %s, which does not exist", event, bin))
			}
		}
	}
	if len(chk.Installed) > 0 && contains(chk.Missing, "PreToolUse") {
		chk.Problems = append(chk.Problems, "PreToolUse is not hooked: tool calls are not being decided")
	}
	if o.Scope == state.ScopeMachine {
		if user, err := c.Target(state.ScopeUser); err == nil {
			if s, ok, _ := readJSONObject(user); ok {
				if v, _ := s["disableAllHooks"].(bool); v {
					chk.Warnings = append(chk.Warnings, user+" sets disableAllHooks; verify managed hooks still run on this Claude Code version")
				}
			}
		}
		chk.Warnings = append(chk.Warnings, "not yet verified: that this Claude Code version reads hooks from managed-settings.d/ drop-ins and merges them with other managed hooks")
	}
	return chk
}

// hooksObject returns settings["hooks"] as a map, creating it when absent.
func hooksObject(settings map[string]any) map[string]any {
	if h, ok := settings["hooks"].(map[string]any); ok {
		return h
	}
	return map[string]any{}
}

func asSlice(v any) []any {
	s, _ := v.([]any)
	return s
}

// removeOurs drops every matcher entry whose hooks include one of our
// commands, keeping everything else exactly as found.
func removeOurs(entries any, vendor string) []any {
	var kept []any
	for _, e := range asSlice(entries) {
		if entryCommand(e, vendor) == "" {
			kept = append(kept, e)
		}
	}
	return kept
}

func ourCommand(entries any, vendor string) string {
	for _, e := range asSlice(entries) {
		if cmd := entryCommand(e, vendor); cmd != "" {
			return cmd
		}
	}
	return ""
}

func entryCommand(entry any, vendor string) string {
	m, _ := entry.(map[string]any)
	for _, h := range asSlice(m["hooks"]) {
		hm, _ := h.(map[string]any)
		if cmd, _ := hm["command"].(string); IsOurs(cmd, vendor) {
			return cmd
		}
	}
	return ""
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
