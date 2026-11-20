package install

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter/gemini"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// geminiInstaller registers hooks with Gemini CLI (v0.68.0; hooksConfig.enabled
// defaults to true).
//
//   - machine scope: the system settings.json, merged in. System settings are
//     applied last, and hooks from every layer accumulate.
//   - user scope: ~/.gemini/settings.json.
//
// What a user can still do at either scope, and so what Check looks for or
// declares: disable a hook by name (hooksConfig.disabled, or /hooks disable at
// runtime), and work in a folder Gemini does not trust, where no hook runs.
type geminiInstaller struct{}

func init() { register(geminiInstaller{}) }

// geminiTimeoutMs is hookTimeoutSeconds in Gemini's unit.
const geminiTimeoutMs = hookTimeoutSeconds * 1000

func (geminiInstaller) Vendor() string { return gemini.Vendor }

// GeminiSystemSettings is Gemini CLI's system settings file on this OS.
func GeminiSystemSettings() string {
	if p := os.Getenv("GEMINI_CLI_SYSTEM_SETTINGS_PATH"); p != "" {
		return p
	}
	switch runtime.GOOS {
	case "darwin":
		return "/Library/Application Support/GeminiCli/settings.json"
	case "windows":
		base := os.Getenv("ProgramData")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, "gemini-cli", "settings.json")
	default:
		return "/etc/gemini-cli/settings.json"
	}
}

func (geminiInstaller) Target(scope state.Scope) (string, error) {
	if scope == state.ScopeMachine {
		return GeminiSystemSettings(), nil
	}
	return homePath(".gemini", "settings.json")
}

// geminiHookName names our hook for an event, so Check can see it in a
// hooksConfig.disabled list.
func geminiHookName(event string) string { return "vaultysclaw-hooks-" + strings.ToLower(event) }

var geminiShape = entryShape{
	command: entryCommand,
	build: func(command, event string) map[string]any {
		entry := map[string]any{"hooks": []any{map[string]any{
			"type": "command", "command": command, "timeout": geminiTimeoutMs, "name": geminiHookName(event),
		}}}
		if gemini.ToolMatcherEvents[event] {
			entry["matcher"] = "*"
		}
		return entry
	},
}

func (c geminiInstaller) Install(o Options) (Result, error) {
	target, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	res, err := mergeInstall(o, c.Vendor(), target, gemini.Events, geminiShape, map[string]any{})
	if err == nil && o.Scope == state.ScopeUser {
		res.Notes = append(res.Notes, "user scope: anything running as you, including the agent, can remove this — use --scope=machine to govern")
	}
	return res, err
}

func (c geminiInstaller) Uninstall(o Options) (Result, error) {
	target, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	return mergeUninstall(o, c.Vendor(), target, geminiShape, map[string]any{})
}

func (c geminiInstaller) Check(o Options) Check {
	chk := Check{Vendor: c.Vendor()}
	if p, err := exec.LookPath("gemini"); err == nil {
		chk.HarnessFound, chk.HarnessDetail = true, p
	} else if dir, err := homePath(".gemini"); err == nil && exists(dir) {
		chk.HarnessFound, chk.HarnessDetail = true, dir
	}
	target, err := c.Target(o.Scope)
	if err != nil {
		chk.Problems = append(chk.Problems, err.Error())
		return chk
	}
	checkMerged(&chk, c.Vendor(), target, gemini.Events, geminiShape)
	chk.Decides = contains(chk.Installed, "BeforeTool")
	if len(chk.Installed) > 0 && !chk.Decides {
		chk.Problems = append(chk.Problems, "BeforeTool is not hooked: tool calls are not being decided")
	}

	// Switches a user can flip in their own settings. System settings win for
	// hooksConfig.enabled; the disabled list is a union across every layer.
	user, _ := homePath(".gemini", "settings.json")
	for _, path := range []string{GeminiSystemSettings(), user} {
		s, ok, err := readJSONObject(path)
		if err != nil || !ok {
			continue
		}
		hc, _ := s["hooksConfig"].(map[string]any)
		if enabled, set := hc["enabled"].(bool); set && !enabled {
			chk.Problems = append(chk.Problems, path+" sets hooksConfig.enabled to false: no hook runs")
		}
		for _, d := range asSlice(hc["disabled"]) {
			if name, _ := d.(string); name == geminiHookName("BeforeTool") || IsOurs(name, c.Vendor()) {
				chk.Problems = append(chk.Problems, path+" disables our BeforeTool hook by name")
			}
		}
	}

	chk.Gaps = append(chk.Gaps,
		"no hook runs, system hooks included, in a folder Gemini CLI does not trust (folder trust is on by default)",
		"a user can disable a hook by name at runtime (/hooks disable), which no file shows")
	return chk
}
