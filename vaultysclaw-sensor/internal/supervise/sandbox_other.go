//go:build !darwin

package supervise

import "runtime"

// Linux (user namespaces + Landlock + seccomp) and Windows (restricted token /
// AppContainer) are designed in docs/HARNESS_SUPERVISOR.md §6 and not built.
// One platform end to end beats three half-built, and the honest report of an
// unbuilt one is an error the launcher surfaces — never a silent pass that
// leaves an operator believing they are confined.
func NewSandbox(spec SandboxSpec, dir string) (*Sandbox, error) {
	return nil, ErrSandboxUnavailable{Platform: runtime.GOOS, Why: "only darwin has a backend today"}
}

// BuildProfile has no meaning without a backend.
func BuildProfile(spec SandboxSpec) string { return "" }
