package install

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter/cline"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// clineInstaller writes Cline hook files: one executable script per event,
// named after it, in ~/Documents/Cline/Hooks — the global hooks directory both
// the VS Code extension and the Cline CLI read.
//
// **Cline has no admin-managed hook location.** Every directory it reads is the
// user's, and any user can switch hooks off in Cline's settings. Machine scope
// therefore installs nothing and says so; Check reports the harness as
// ungoverned at that scope rather than pretending a user-scope file is policy.
//
// A hook file is a whole file per event, so one that is not ours is never
// overwritten: install refuses before writing anything.
type clineInstaller struct{}

func init() { register(clineInstaller{}) }

func (clineInstaller) Vendor() string { return cline.Vendor }

const clineNoMachineScope = "Cline has no admin-managed hook location; install it per user with --scope=user"

func (clineInstaller) Target(scope state.Scope) (string, error) {
	return homePath("Documents", "Cline", "Hooks")
}

func clineFile(dir, event string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(dir, event+".ps1")
	}
	return filepath.Join(dir, event)
}

func clineScript(command string) string {
	if runtime.GOOS == "windows" {
		return "# Installed by vaultysclaw-hooks; removed by `vaultysclaw-hooks uninstall`.\r\n" +
			"$input | & " + command + "\r\nexit $LASTEXITCODE\r\n"
	}
	return "#!/bin/sh\n# Installed by vaultysclaw-hooks; removed by `vaultysclaw-hooks uninstall`.\nexec " + command + "\n"
}

// clineOurs reports whether a hook file exists and is ours.
func clineOurs(path, vendor string) (exists, ours bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return false, false
	}
	return true, IsOurs(string(data), vendor)
}

func (c clineInstaller) Install(o Options) (Result, error) {
	dir, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	res := Result{Vendor: c.Vendor(), Target: dir}
	if o.Scope == state.ScopeMachine {
		res.Notes = append(res.Notes, "skipped: "+clineNoMachineScope)
		return res, nil
	}
	for _, event := range cline.Events {
		if exists, ours := clineOurs(clineFile(dir, event), c.Vendor()); exists && !ours {
			return res, fmt.Errorf("%s already exists and is not ours; nothing was installed — merge it by hand or move it aside", clineFile(dir, event))
		}
	}
	if o.DryRun {
		res.Notes = append(res.Notes, "would write hook files in "+dir)
		return res, nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return res, err
	}
	for _, event := range cline.Events {
		path := clineFile(dir, event)
		tmp := path + ".tmp"
		if err := os.WriteFile(tmp, []byte(clineScript(HookCommand(o, c.Vendor(), event))), 0o755); err != nil {
			return res, err
		}
		if err := os.Chmod(tmp, 0o755); err != nil && runtime.GOOS != "windows" {
			return res, err
		}
		if err := os.Rename(tmp, path); err != nil {
			return res, err
		}
	}
	res.Changed = true
	res.Notes = append(res.Notes,
		"Cline's \"Hooks\" feature setting must stay on; any user can switch it off",
		"user scope: anything running as you, including the agent, can remove this")
	return res, nil
}

func (c clineInstaller) Uninstall(o Options) (Result, error) {
	dir, err := c.Target(o.Scope)
	if err != nil {
		return Result{}, err
	}
	res := Result{Vendor: c.Vendor(), Target: dir}
	if o.Scope == state.ScopeMachine {
		return res, nil
	}
	for _, event := range cline.Events {
		path := clineFile(dir, event)
		if _, ours := clineOurs(path, c.Vendor()); !ours {
			continue
		}
		if o.DryRun {
			res.Notes = append(res.Notes, "would remove "+path)
			continue
		}
		if err := os.Remove(path); err != nil {
			return res, err
		}
		res.Changed = true
	}
	return res, nil
}

func (c clineInstaller) Check(o Options) Check {
	chk := Check{Vendor: c.Vendor()}
	if p, err := exec.LookPath("cline"); err == nil {
		chk.HarnessFound, chk.HarnessDetail = true, p
	} else {
		for _, rel := range [][]string{{".cline"}, {"Documents", "Cline"}} {
			if p, err := homePath(rel...); err == nil && exists(p) {
				chk.HarnessFound, chk.HarnessDetail = true, p
				break
			}
		}
	}
	dir, err := c.Target(o.Scope)
	if err != nil {
		chk.Problems = append(chk.Problems, err.Error())
		return chk
	}
	chk.Target = dir
	if o.Scope == state.ScopeMachine {
		chk.Missing = append(chk.Missing, cline.Events...)
		chk.Problems = append(chk.Problems, clineNoMachineScope)
		return chk
	}
	for _, event := range cline.Events {
		path := clineFile(dir, event)
		exists, ours := clineOurs(path, c.Vendor())
		switch {
		case !exists:
			chk.Missing = append(chk.Missing, event)
		case !ours:
			chk.Missing = append(chk.Missing, event)
			if event == "PreToolUse" {
				chk.Problems = append(chk.Problems, path+" is someone else's hook; ours is not installed")
			}
		default:
			chk.Installed = append(chk.Installed, event)
			if info, err := os.Stat(path); err == nil && runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
				chk.Problems = append(chk.Problems, path+" is not executable; Cline silently skips it")
			}
		}
	}
	chk.Decides = contains(chk.Installed, "PreToolUse")

	chk.Gaps = append(chk.Gaps,
		"every hook failure (timeout, crash) lets the call through",
		"any user can switch hooks off in Cline's settings; there is no admin-managed location",
		"the Cline CLI's --yolo mode runs no hooks")
	return chk
}
