package install

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter/codex"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// codexInstaller registers hooks with OpenAI Codex (codex-rs, hooks feature,
// stable and on by default as of rust-v0.167.2).
//
//   - machine scope: hooks.json in Codex's system config layer (/etc/codex on
//     Unix). Hooks from a managed layer are always trusted and cannot be
//     disabled by the user.
//   - user scope: ~/.codex/hooks.json (or $CODEX_HOME). Codex runs user-layer
//     hooks only once the user has approved them in its hook review, and a
//     changed hook needs approving again — so a user-scope install decides
//     nothing until then. Declared as a gap.
type codexInstaller struct{}

func init() { register(codexInstaller{}) }

func (codexInstaller) Vendor() string { return codex.Vendor }

// CodexSystemDir is Codex's system config directory on this OS.
func CodexSystemDir() string {
	if runtime.GOOS == "windows" {
		base := os.Getenv("ProgramData")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, "OpenAI", "Codex")
	}
	return "/etc/codex"
}

func codexHome() (string, error) {
	if h := os.Getenv("CODEX_HOME"); h != "" {
		return h, nil
	}
	return homePath(".codex")
}

func (codexInstaller) Target(scope state.Scope) (string, error) {
	if scope == state.ScopeMachine {
		return filepath.Join(CodexSystemDir(), "hooks.json"), nil
	}
	dir, err := codexHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "hooks.json"), nil
}

var codexShape = entryShape{
	command: entryCommand,
	build: func(command, event string) map[string]any {
		entry := map[string]any{"hooks": []any{map[string]any{
			"type": "command", "command": command, "timeout": hookTimeoutSeconds,
		}}}
		if codex.ToolMatcherEvents[event] {
			entry["matcher"] = "*"
		}
		return entry
	},
}

func (c codexInstaller) Install(o Options) (Result, error) {
	target, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	res, err := mergeInstall(o, c.Vendor(), target, codex.Events, codexShape, map[string]any{})
	if err == nil && o.Scope == state.ScopeUser {
		res.Notes = append(res.Notes,
			"Codex runs user-scope hooks only after you approve them in its hook review — until then nothing is decided",
			"user scope: anything running as you, including the agent, can remove this — use --scope=machine to govern")
	}
	return res, err
}

func (c codexInstaller) Uninstall(o Options) (Result, error) {
	target, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	return mergeUninstall(o, c.Vendor(), target, codexShape, map[string]any{})
}

func (c codexInstaller) Check(o Options) Check {
	chk := Check{Vendor: c.Vendor()}
	if p, err := exec.LookPath("codex"); err == nil {
		chk.HarnessFound, chk.HarnessDetail = true, p
	} else if dir, err := codexHome(); err == nil && exists(dir) {
		chk.HarnessFound, chk.HarnessDetail = true, dir
	}
	target, err := c.Target(o.Scope)
	if err != nil {
		chk.Problems = append(chk.Problems, err.Error())
		return chk
	}
	checkMerged(&chk, c.Vendor(), target, codex.Events, codexShape)
	chk.Decides = contains(chk.Installed, "PreToolUse")
	if len(chk.Installed) > 0 && !chk.Decides {
		chk.Problems = append(chk.Problems, "PreToolUse is not hooked: tool calls are not being decided")
	}

	chk.Gaps = append(chk.Gaps,
		"input typed into an already-running interactive shell session (write_stdin) never reaches a hook")
	if o.Scope == state.ScopeUser {
		chk.Gaps = append(chk.Gaps,
			"user-scope hooks run only once approved in Codex's hook review; this cannot be checked from outside Codex")
	}
	// Codex warns, and its behaviour is layer-specific, when one layer declares
	// hooks both in hooks.json and in config.toml.
	if data, err := os.ReadFile(filepath.Join(filepath.Dir(target), "config.toml")); err == nil &&
		strings.Contains(string(data), "[hooks") {
		chk.Warnings = append(chk.Warnings, filepath.Join(filepath.Dir(target), "config.toml")+
			" also declares hooks; Codex warns when one layer has both — check ours still run")
	}
	if runtime.GOOS == "windows" && o.Scope == state.ScopeMachine {
		chk.Warnings = append(chk.Warnings, "not yet verified: that Codex reads its system config layer from "+CodexSystemDir()+" on Windows")
	}
	return chk
}
