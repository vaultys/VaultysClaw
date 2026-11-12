package install

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter/copilot"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// copilotInstaller registers hooks with GitHub Copilot CLI (and the VS Code
// agent harness sharing its format).
//
//   - machine scope: a file of our own in the policy directory
//     (/etc/github-copilot/policy.d/ on Unix). Policy hooks run first, cannot be
//     switched off by disableAllHooks, and "end users cannot modify them".
//     Copilot only loads a policy file that is root-owned and not group- or
//     world-writable.
//   - user scope: a file of our own in ~/.copilot/hooks/ ($COPILOT_HOME).
//
// Both are whole files of ours, so uninstall removes the file.
type copilotInstaller struct{}

func init() { register(copilotInstaller{}) }

const copilotFile = "50-vaultysclaw-hooks.json"

func (copilotInstaller) Vendor() string { return copilot.Vendor }

// CopilotPolicyDir is Copilot's machine-wide policy hooks directory.
func CopilotPolicyDir() string {
	if runtime.GOOS == "windows" {
		base := os.Getenv("ProgramData")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, "GitHub", "Copilot", "policy.d")
	}
	return "/etc/github-copilot/policy.d"
}

func copilotHome() (string, error) {
	if h := os.Getenv("COPILOT_HOME"); h != "" {
		return h, nil
	}
	return homePath(".copilot")
}

func (copilotInstaller) Target(scope state.Scope) (string, error) {
	if scope == state.ScopeMachine {
		return filepath.Join(CopilotPolicyDir(), copilotFile), nil
	}
	home, err := copilotHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "hooks", copilotFile), nil
}

// copilotCommand reads our command out of an entry: bash on Unix, powershell
// carries the same command behind PowerShell's call operator.
func copilotCommand(entry any, vendor string) string {
	m, _ := entry.(map[string]any)
	for _, k := range []string{"bash", "command"} {
		if cmd, _ := m[k].(string); IsOurs(cmd, vendor) {
			return cmd
		}
	}
	return ""
}

var copilotShape = entryShape{
	command: copilotCommand,
	build: func(command, event string) map[string]any {
		return map[string]any{
			"type": "command",
			"bash": command,
			// PowerShell does not run a quoted path followed by arguments;
			// the call operator makes it a command.
			"powershell": "& " + command,
			"timeoutSec": hookTimeoutSeconds,
		}
	},
}

func (c copilotInstaller) Install(o Options) (Result, error) {
	target, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	res := Result{Vendor: c.Vendor(), Target: target}
	hooks := map[string]any{}
	for _, event := range copilot.Events {
		hooks[event] = []any{copilotShape.build(HookCommand(o, c.Vendor(), event), event)}
	}
	if o.DryRun {
		res.Notes = append(res.Notes, "would write "+target)
		return res, nil
	}
	perm, dirPerm := filePerms(o.Scope)
	if err := writeJSONAtomic(target, map[string]any{"version": 1, "hooks": hooks}, perm, dirPerm); err != nil {
		return res, err
	}
	res.Changed = true
	if o.Scope == state.ScopeUser {
		res.Notes = append(res.Notes, "user scope: anything running as you, including the agent, can remove this — use --scope=machine to govern")
	}
	return res, nil
}

func (c copilotInstaller) Uninstall(o Options) (Result, error) {
	target, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	res := Result{Vendor: c.Vendor(), Target: target}
	if !exists(target) {
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

func (c copilotInstaller) Check(o Options) Check {
	chk := Check{Vendor: c.Vendor()}
	if p, err := exec.LookPath("copilot"); err == nil {
		chk.HarnessFound, chk.HarnessDetail = true, p
	} else if dir, err := copilotHome(); err == nil && exists(dir) {
		chk.HarnessFound, chk.HarnessDetail = true, dir
	}
	target, err := c.Target(o.Scope)
	if err != nil {
		chk.Problems = append(chk.Problems, err.Error())
		return chk
	}
	checkMerged(&chk, c.Vendor(), target, copilot.Events, copilotShape)
	chk.Decides = contains(chk.Installed, "preToolUse")
	if len(chk.Installed) > 0 && !chk.Decides {
		chk.Problems = append(chk.Problems, "preToolUse is not hooked: tool calls are not being decided")
	}
	if o.Scope == state.ScopeMachine && runtime.GOOS != "windows" {
		if info, err := os.Stat(target); err == nil && info.Mode().Perm()&0o022 != 0 {
			chk.Problems = append(chk.Problems, fmt.Sprintf("%s is group- or world-writable; Copilot ignores such a policy file", target))
		}
	}

	chk.Gaps = append(chk.Gaps, "MCP tools are not mapped yet (Copilot does not document their hook names) and run ungoverned")
	if o.Scope == state.ScopeUser {
		chk.Gaps = append(chk.Gaps, "a repository's settings can set disableAllHooks, which switches user hooks off")
	}
	chk.Warnings = append(chk.Warnings,
		"not yet verified on a live Copilot: whether toolArgs arrives as an object or a string, and the argument names of view/create/edit")
	return chk
}
