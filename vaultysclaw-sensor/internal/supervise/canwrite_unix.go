//go:build !windows

package supervise

import "syscall"

// wOK is POSIX W_OK, which the syscall package does not export on every unix.
const wOK = 0x2

// canWrite asks the kernel, with the real uid, whether path is writable — the
// same question the harness's own open(2) or rename(2) would put to it.
func canWrite(path string) bool {
	return syscall.Access(path, wOK) == nil
}
