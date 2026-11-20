// Package install writes and removes vaultysclaw-hooks' hook registrations in
// each harness's own configuration, and inspects them for `doctor`.
//
// One Installer per harness. They share one rule: an installed hook command is
// recognisable as ours from the command string alone, so uninstall removes
// exactly what install added and nothing an operator wrote by hand.
package install

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// Options is one install, uninstall or check.
type Options struct {
	Scope state.Scope
	// Binary is the absolute path of the vaultysclaw-hooks executable the
	// harness will run.
	Binary string
	// StateDir is where the hook reads its policy.
	StateDir string
	DryRun   bool
}

// Result describes what an install or uninstall did.
type Result struct {
	Vendor  string
	Target  string
	Changed bool
	Notes   []string
}

// Check is an installation's state, for doctor.
type Check struct {
	Vendor string
	// HarnessFound reports whether the harness appears to be installed on this
	// host; HarnessDetail says where it was found.
	HarnessFound  bool
	HarnessDetail string
	Target        string
	// Installed lists the events with a vaultysclaw-hooks registration;
	// Missing the ones that should have one and do not.
	Installed []string
	Missing   []string
	// Decides reports whether every event this harness needs for a decision is
	// hooked. A harness with some audit hooks but no decision hook is watched,
	// not governed.
	Decides bool
	// Gaps are sensitive actions this harness's hook system never shows a hook,
	// whatever is installed — fixed by the vendor's protocol, not by us. A
	// non-empty list means "enforcing" would overstate what is governed.
	Gaps []string
	// Problems are things that make the installation not work as intended.
	Problems []string
	// Warnings are limits the operator should know about but cannot fix here.
	Warnings []string
}

// Installer is one harness's integration.
type Installer interface {
	Vendor() string
	// Target is the settings file this installer writes for a scope.
	Target(scope state.Scope) (string, error)
	Install(o Options) (Result, error)
	Uninstall(o Options) (Result, error)
	Check(o Options) Check
}

var installers = map[string]Installer{}

func register(i Installer) { installers[i.Vendor()] = i }

// For returns the installers for a --vendor value ("all" or a comma list).
func For(vendors string) ([]Installer, error) {
	v := strings.TrimSpace(vendors)
	if v == "" || v == "all" {
		var out []Installer
		for _, name := range Vendors() {
			out = append(out, installers[name])
		}
		return out, nil
	}
	var out []Installer
	for _, name := range strings.Split(v, ",") {
		name = canonical(strings.TrimSpace(name))
		i, ok := installers[name]
		if !ok {
			return nil, fmt.Errorf("install: no installer for %q (known: %s)", name, strings.Join(Vendors(), ", "))
		}
		out = append(out, i)
	}
	return out, nil
}

// Vendors lists the vendors with an installer, sorted.
func Vendors() []string {
	var out []string
	for name := range installers {
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

func canonical(v string) string {
	switch strings.ToLower(v) {
	case "cc", "claude", "claudecode":
		return "claude-code"
	case "openai-codex":
		return "codex"
	case "cursor-agent":
		return "cursor"
	case "copilot-cli", "github-copilot":
		return "copilot"
	case "gemini-cli":
		return "gemini"
	case "cline-cli":
		return "cline"
	}
	return strings.ToLower(v)
}

// HookCommand is the command line a harness runs for one event.
//
// Paths are double-quoted: harnesses run hook commands through a shell, and an
// install under "Application Support" or "Program Files" has a space in it.
func HookCommand(o Options, vendor, event string) string {
	return fmt.Sprintf(`%s hook --vendor=%s --event=%s --scope=%s --state=%s`,
		quote(o.Binary), vendor, event, o.Scope, quote(o.StateDir))
}

// IsOurs reports whether a hook command string was written by this package.
//
// It matches the argument signature HookCommand produces, not the binary's
// name, so an install that renamed or relocated the executable is still
// recognised and cleanly removable.
func IsOurs(command, vendor string) bool {
	return strings.Contains(command, " hook --vendor="+vendor+" --event=") &&
		strings.Contains(command, " --scope=") &&
		strings.Contains(command, " --state=")
}

// commandBinary extracts the executable from a command HookCommand produced.
func commandBinary(command string) string {
	if strings.HasPrefix(command, `"`) {
		if end := strings.Index(command[1:], `"`); end >= 0 {
			return command[1 : end+1]
		}
	}
	if sp := strings.IndexByte(command, ' '); sp > 0 {
		return command[:sp]
	}
	return command
}

func quote(s string) string {
	return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
}

// readJSONObject reads a JSON object file, or an empty object when absent.
func readJSONObject(path string) (map[string]any, bool, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return map[string]any{}, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if strings.TrimSpace(string(data)) == "" {
		return map[string]any{}, true, nil
	}
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		// Never overwrite a file we cannot parse: it is someone's
		// configuration, and rewriting it would destroy it.
		return nil, true, fmt.Errorf("install: %s is not a JSON object (%v); fix or remove it first", path, err)
	}
	return obj, true, nil
}

// writeJSONAtomic writes obj to path via a temp file and rename, so a harness
// starting mid-install reads either the old file or the new one, never half.
func writeJSONAtomic(path string, obj any, perm os.FileMode, dirPerm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), dirPerm); err != nil {
		return err
	}
	data, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), perm); err != nil && runtime.GOOS != "windows" {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// EnsureStateDir creates the state directory and a default config, if absent.
//
// Machine scope is world-readable and root-owned: the hook runs as the user and
// must read its policy, and must not be able to change it.
func EnsureStateDir(o Options) ([]string, error) {
	var notes []string
	dirPerm, filePerm := os.FileMode(0o700), os.FileMode(0o600)
	if o.Scope == state.ScopeMachine {
		dirPerm, filePerm = 0o755, 0o644
	}
	if o.DryRun {
		return []string{"would create " + o.StateDir}, nil
	}
	if err := os.MkdirAll(o.StateDir, dirPerm); err != nil {
		return nil, err
	}
	if o.Scope == state.ScopeMachine {
		// One shared spool directory: every user's hook appends its own file,
		// the agent drains them all. Sticky, so no user can remove another's.
		spoolDir := state.SpoolDir(o.Scope)
		if err := os.MkdirAll(spoolDir, 0o755); err != nil {
			return nil, err
		}
		if runtime.GOOS != "windows" {
			if err := os.Chmod(spoolDir, 0o777|os.ModeSticky); err != nil {
				return nil, err
			}
		}
	}
	cfgPath := filepath.Join(o.StateDir, state.ConfigFile)
	if _, err := os.Stat(cfgPath); os.IsNotExist(err) {
		if err := writeJSONAtomic(cfgPath, state.DefaultConfig(), filePerm, dirPerm); err != nil {
			return nil, err
		}
		notes = append(notes, "wrote default config (observe mode) to "+cfgPath)
	}
	return notes, nil
}
