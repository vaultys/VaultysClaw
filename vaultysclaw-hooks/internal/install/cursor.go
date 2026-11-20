package install

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter/cursor"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// cursorInstaller registers hooks with Cursor (editor agent and cursor-agent),
// per https://cursor.com/docs/agent/hooks (checked 2026-11-12).
//
//   - machine scope: the enterprise hooks.json. Cursor runs every matching
//     hook from every level (enterprise, team, project, user) and a deny from
//     any of them wins, so a lower level cannot overrule ours. The file may be
//     MDM-managed, so ours are merged in, never written over it.
//   - user scope: ~/.cursor/hooks.json.
//
// Every entry sets failClosed: by default Cursor lets an action through when a
// hook crashes or times out.
type cursorInstaller struct{}

func init() { register(cursorInstaller{}) }

func (cursorInstaller) Vendor() string { return cursor.Vendor }

// CursorEnterpriseHooks is Cursor's enterprise hooks.json on this OS.
func CursorEnterpriseHooks() string {
	switch runtime.GOOS {
	case "darwin":
		return "/Library/Application Support/Cursor/hooks.json"
	case "windows":
		base := os.Getenv("ProgramData")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, "Cursor", "hooks.json")
	default:
		return "/etc/cursor/hooks.json"
	}
}

func (cursorInstaller) Target(scope state.Scope) (string, error) {
	if scope == state.ScopeMachine {
		return CursorEnterpriseHooks(), nil
	}
	return homePath(".cursor", "hooks.json")
}

var cursorShape = entryShape{
	command: flatCommand,
	build: func(command, event string) map[string]any {
		return map[string]any{
			"type": "command", "command": command, "timeout": hookTimeoutSeconds, "failClosed": true,
		}
	},
}

var cursorBase = map[string]any{"version": 1}

func (c cursorInstaller) Install(o Options) (Result, error) {
	target, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	res, err := mergeInstall(o, c.Vendor(), target, cursor.Events, cursorShape, cursorBase)
	if err == nil && o.Scope == state.ScopeUser {
		res.Notes = append(res.Notes, "user scope: anything running as you, including the agent, can remove this — use --scope=machine to govern")
	}
	return res, err
}

func (c cursorInstaller) Uninstall(o Options) (Result, error) {
	target, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	return mergeUninstall(o, c.Vendor(), target, cursorShape, cursorBase)
}

func (c cursorInstaller) Check(o Options) Check {
	chk := Check{Vendor: c.Vendor()}
	for _, bin := range []string{"cursor-agent", "cursor"} {
		if p, err := exec.LookPath(bin); err == nil {
			chk.HarnessFound, chk.HarnessDetail = true, p
			break
		}
	}
	if !chk.HarnessFound {
		candidates := []string{"/Applications/Cursor.app"}
		if dir, err := homePath(".cursor"); err == nil {
			candidates = append(candidates, dir)
		}
		for _, p := range candidates {
			if exists(p) {
				chk.HarnessFound, chk.HarnessDetail = true, p
				break
			}
		}
	}
	target, err := c.Target(o.Scope)
	if err != nil {
		chk.Problems = append(chk.Problems, err.Error())
		return chk
	}
	settings, existed := checkMerged(&chk, c.Vendor(), target, cursor.Events, cursorShape)
	chk.Decides = contains(chk.Installed, "preToolUse")
	if len(chk.Installed) > 0 && !chk.Decides {
		chk.Problems = append(chk.Problems, "preToolUse is not hooked: file writes and most tools are not being decided")
	}
	if existed {
		for _, e := range asSlice(hooksObject(settings)["preToolUse"]) {
			if m, _ := e.(map[string]any); flatCommand(e, c.Vendor()) != "" && m["failClosed"] != true {
				chk.Problems = append(chk.Problems, "our preToolUse entry lacks failClosed: a crashed or timed-out hook would let the call through")
			}
		}
	}

	chk.Gaps = append(chk.Gaps,
		"web search, web fetch and codebase search are not documented as reaching preToolUse",
		"MCP tools are decided only on beforeMCPExecution; cursor-agent releases that do not fire it leave them ungoverned")
	chk.Warnings = append(chk.Warnings,
		"not yet verified on a live Cursor: that `{}` is read as \"no objection\" by every permission hook, and the tool_input field names of Read/Write/Delete")
	return chk
}
