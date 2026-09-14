//go:build windows

package supervise

import (
	"os"
	"path/filepath"
)

// readProbeCommand is the canary read used by the sandbox self-test.
//
// Windows has no /bin/cat, so this goes through the shell's own `type`. Resolved
// from ComSpec rather than spelled "cmd.exe" so the probe does not depend on a
// PATH the supervisor may not have inherited.
func readProbeCommand(path string) []string {
	shell := os.Getenv("ComSpec")
	if shell == "" {
		shell = filepath.Join(os.Getenv("SystemRoot"), "System32", "cmd.exe")
	}
	return []string{shell, "/c", "type", path}
}
