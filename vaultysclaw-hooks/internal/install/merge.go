package install

import (
	"os"
	"path/filepath"

	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// Shared plumbing for installers that merge into a JSON hooks file someone
// else may also own (Codex's and Cursor's), as opposed to Claude Code's
// machine scope, which writes a drop-in of its own.
//
// Two entry shapes exist:
//   - nested (Claude Code, Codex): hooks[event] = [{matcher, hooks: [{type, command, timeout}]}]
//   - flat (Cursor):               hooks[event] = [{command, type, timeout, ...}]

// entryShape knows how to build and recognise one harness's entries.
type entryShape struct {
	build func(command string, event string) map[string]any
	// command returns the entry's command if it is ours, else "".
	command func(entry any, vendor string) string
}

func flatCommand(entry any, vendor string) string {
	m, _ := entry.(map[string]any)
	if cmd, _ := m["command"].(string); IsOurs(cmd, vendor) {
		return cmd
	}
	return ""
}

func filePerms(scope state.Scope) (os.FileMode, os.FileMode) {
	if scope == state.ScopeMachine {
		return 0o644, 0o755
	}
	return 0o600, 0o700
}

// mergeInstall adds our entry for every event to target, replacing any of ours
// already there and keeping everything else exactly as found. base seeds a file
// that does not exist yet.
func mergeInstall(o Options, vendor, target string, events []string, shape entryShape, base map[string]any) (Result, error) {
	res := Result{Vendor: vendor, Target: target}
	settings, existed, err := readJSONObject(target)
	if err != nil {
		return res, err
	}
	if !existed {
		for k, v := range base {
			settings[k] = v
		}
	}
	hooks := hooksObject(settings)
	for _, event := range events {
		kept := keepOthers(hooks[event], vendor, shape)
		hooks[event] = append(kept, shape.build(HookCommand(o, vendor, event), event))
	}
	settings["hooks"] = hooks
	if o.DryRun {
		res.Notes = append(res.Notes, "would write "+target)
		return res, nil
	}
	perm, dirPerm := filePerms(o.Scope)
	if err := writeJSONAtomic(target, settings, perm, dirPerm); err != nil {
		return res, err
	}
	res.Changed = true
	return res, nil
}

// mergeUninstall removes our entries from target. A file left with nothing
// but our former entries is removed, so uninstall leaves no trace of install.
func mergeUninstall(o Options, vendor, target string, shape entryShape, base map[string]any) (Result, error) {
	res := Result{Vendor: vendor, Target: target}
	settings, existed, err := readJSONObject(target)
	if err != nil || !existed {
		return res, err
	}
	hooks := hooksObject(settings)
	changed := false
	for event, entries := range hooks {
		before := asSlice(entries)
		kept := keepOthers(entries, vendor, shape)
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
	res.Changed = true
	if onlyBase(settings, base) {
		return res, os.Remove(target)
	}
	perm, dirPerm := filePerms(o.Scope)
	return res, writeJSONAtomic(target, settings, perm, dirPerm)
}

// onlyBase reports whether settings holds no key beyond the ones install
// seeded (e.g. Cursor's "version"), i.e. nothing anyone else wrote.
func onlyBase(settings, base map[string]any) bool {
	for k := range settings {
		if _, ok := base[k]; !ok {
			return false
		}
	}
	return true
}

func keepOthers(entries any, vendor string, shape entryShape) []any {
	kept := []any{}
	for _, e := range asSlice(entries) {
		if shape.command(e, vendor) == "" {
			kept = append(kept, e)
		}
	}
	return kept
}

// checkMerged fills Installed/Missing/Problems for target.
func checkMerged(chk *Check, vendor, target string, events []string, shape entryShape) (map[string]any, bool) {
	chk.Target = target
	settings, existed, err := readJSONObject(target)
	if err != nil {
		chk.Problems = append(chk.Problems, err.Error())
		return nil, false
	}
	if !existed {
		chk.Missing = append(chk.Missing, events...)
		return settings, false
	}
	hooks := hooksObject(settings)
	for _, event := range events {
		cmd := ""
		for _, e := range asSlice(hooks[event]) {
			if c := shape.command(e, vendor); c != "" {
				cmd = c
				break
			}
		}
		if cmd == "" {
			chk.Missing = append(chk.Missing, event)
			continue
		}
		chk.Installed = append(chk.Installed, event)
		if bin := commandBinary(cmd); bin != "" {
			if _, err := os.Stat(bin); err != nil {
				chk.Problems = append(chk.Problems, event+" hook runs "+bin+", which does not exist")
			}
		}
	}
	return settings, true
}

// homePath joins elements under the user's home directory.
func homePath(elem ...string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(append([]string{home}, elem...)...), nil
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
