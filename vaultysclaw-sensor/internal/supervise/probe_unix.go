//go:build !windows

package supervise

// readProbeCommand is the canary read used by the sandbox self-test.
//
// An absolute path, not a PATH lookup: the probe has to be the same binary
// inside the sandbox and outside it, or the two halves of the test are not
// comparing the same thing.
func readProbeCommand(path string) []string {
	return []string{"/bin/cat", path}
}
