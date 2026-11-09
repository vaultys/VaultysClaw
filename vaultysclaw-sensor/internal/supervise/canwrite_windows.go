//go:build windows

package supervise

import "os"

// canWrite on Windows: ACLs are not expressible as a mode, so this answers
// conservatively — anything not marked read-only counts as writable, which makes
// the no-confinement refusal apply rather than silently pass.
func canWrite(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.Mode().Perm()&0o200 != 0
}
