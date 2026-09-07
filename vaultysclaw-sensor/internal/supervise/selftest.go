package supervise

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// SelfTest probes whether tier-B confinement is actually in force for a spec, on
// this machine, right now — without launching a harness or spending a session.
//
// It exists because sandbox-exec is deprecated and every one of its failure
// modes is silent: an unresolved path, a file named as a directory, a profile
// that loads and covers nothing. NewSandbox's canary proves the mechanism works
// on a file it created; this proves it works on *the operator's own floor*,
// which is the thing they actually care about and the only thing that answers
// "is my ~/.ssh really protected".
type SelfTest struct {
	Path string
	// Denied is whether the sandbox refused it.
	Denied bool
	// Note explains an inconclusive result — a path that does not exist cannot
	// demonstrate anything, and must never be reported as protected.
	Note string
}

// RunSelfTest attempts to read each denied path inside the sandbox.
func RunSelfTest(sb *Sandbox, spec SandboxSpec) []SelfTest {
	var results []SelfTest
	for _, p := range spec.DenyAll {
		results = append(results, probeRead(sb, p))
	}
	return results
}

func probeRead(sb *Sandbox, path string) SelfTest {
	target := path
	if info, err := os.Stat(path); err != nil {
		return SelfTest{Path: path, Note: "does not exist on this host — nothing to demonstrate"}
	} else if info.IsDir() {
		entries, err := os.ReadDir(path)
		if err != nil || len(entries) == 0 {
			// Listing the directory is itself a read, so an empty one is still
			// a usable probe.
			target = path
		} else {
			target = path + string(os.PathSeparator) + entries[0].Name()
		}
	}

	argv := sb.Wrap([]string{"/bin/cat", target})
	err := exec.Command(argv[0], argv[1:]...).Run()
	if err == nil {
		return SelfTest{Path: path, Denied: false, Note: "READ SUCCEEDED — this path is not protected"}
	}
	return SelfTest{Path: path, Denied: true}
}

// FormatSelfTest renders the results, and reports whether every conclusive probe
// was denied.
func FormatSelfTest(results []SelfTest) (string, bool) {
	var b strings.Builder
	allDenied := true
	conclusive := 0
	for _, r := range results {
		switch {
		case r.Note != "" && !r.Denied && strings.HasPrefix(r.Note, "READ SUCCEEDED"):
			allDenied = false
			conclusive++
			fmt.Fprintf(&b, "  FAIL      %s — %s\n", r.Path, r.Note)
		case r.Note != "":
			fmt.Fprintf(&b, "  skipped   %s — %s\n", r.Path, r.Note)
		default:
			conclusive++
			fmt.Fprintf(&b, "  confined  %s\n", r.Path)
		}
	}
	if conclusive == 0 {
		// Every probe was skipped. "No failures" is not the same as "protected",
		// and reporting a pass here would be the exact false assurance this
		// whole self-test exists to prevent.
		return b.String(), false
	}
	return b.String(), allDenied
}
