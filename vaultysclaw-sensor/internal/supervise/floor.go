package supervise

import (
	"os"
	"path/filepath"
	"strings"
)

// Floor is a deny-only list of filesystem paths this interception point refuses
// to touch regardless of what any certificate says.
//
// It is unsigned local configuration, which everywhere else in this design
// would be disqualifying — policy travels as signed artefacts precisely so a
// host cannot widen its own grant. The floor is admissible for exactly one
// reason: **it can only ever refuse.** Adding an entry can never authorize
// anything, so a tampered floor cannot grant its author more than they had. The
// moment an entry could widen a decision it belongs in a signed rule set
// instead.
//
// It exists because rules.Rule is host/port-shaped and cannot express a
// filesystem resource at all (docs/HARNESS_SUPERVISOR.md §3), so until phase 3
// extends that format there is no signed way to say "never ~/.ssh". Shipping
// without one would mean an unscoped grant reads the operator's private keys.
type Floor struct {
	entries []floorEntry
}

type floorEntry struct {
	path   string
	reason string
	// own marks one of this supervisor's own artefacts, as opposed to a
	// credential path. Own artefacts are protected unconditionally; the rest of
	// the floor steps aside once signed policy is in force (see Decide).
	own bool
}

// FloorPath is an extra floor entry with its own explanation, so a denial can
// name "this supervisor's own capability grant" rather than repeating the
// generic reason for something an operator would want called out.
type FloorPath struct {
	Path   string
	Reason string
}

// DefaultFloorPaths are the paths refused out of the box, relative to the home
// directory unless absolute. Credentials the agent has no business reading; the
// artefacts that govern the agent itself are added by the caller, which is what
// knows where they live.
var DefaultFloorPaths = []string{
	"~/.ssh",
	"~/.aws",
	"~/.gnupg",
	"~/.config/gcloud",
	"~/.kube",
	"~/.docker/config.json",
	"~/.npmrc",
	"~/.netrc",
	"~/.git-credentials",
}

// NewFloor builds a Floor from path patterns, expanding a leading "~" and
// resolving each entry the same way an incoming path is resolved — otherwise a
// symlinked home directory would put every entry just out of reach of the
// comparison it exists for.
func NewFloor(paths []string, extra ...FloorPath) *Floor {
	f := &Floor{}
	home, _ := os.UserHomeDir()
	for _, p := range paths {
		f.add(expandHome(p, home), "on the safety floor")
	}
	for _, e := range extra {
		f.addOwn(expandHome(e.Path, home), e.Reason)
	}
	return f
}

// IsOwnArtefact reports whether path is one of this supervisor's own files.
// Those are protected whether or not signed policy is in force.
func (f *Floor) IsOwnArtefact(path string) bool {
	if f == nil {
		return false
	}
	for _, e := range f.entries {
		if !e.own {
			continue
		}
		if path == e.path || strings.HasPrefix(path, e.path+string(os.PathSeparator)) {
			return true
		}
	}
	return false
}

func (f *Floor) addOwn(path, reason string) {
	f.add(path, reason)
	if n := len(f.entries); n > 0 && f.entries[n-1].path != "" {
		f.entries[n-1].own = true
	}
}

func (f *Floor) add(path, reason string) {
	if strings.TrimSpace(path) == "" {
		return
	}
	// Resolve, but keep the cleaned path when resolution fails: an entry naming
	// a directory that does not exist on this host must still be refused if it
	// is created later.
	resolved, err := ResolvePath(path, "")
	if err != nil || resolved == "" {
		resolved = filepath.Clean(path)
	}
	f.entries = append(f.entries, floorEntry{path: resolved, reason: reason})
}

// Refuses reports whether path is on the floor, and why.
//
// Matching is by path segment, never by string prefix: "~/.sshfoo" must not
// match an entry for "~/.ssh", and a plain strings.HasPrefix would say it does.
func (f *Floor) Refuses(path string) (bool, string) {
	if f == nil || path == "" {
		return false, ""
	}
	for _, e := range f.entries {
		if path == e.path || strings.HasPrefix(path, e.path+string(os.PathSeparator)) {
			return true, e.reason + " (" + e.path + ")"
		}
	}
	return false, ""
}

// Paths returns what the floor currently refuses, for the startup log line. An
// operator must be able to see the floor without reading the source.
func (f *Floor) Paths() []string {
	if f == nil {
		return nil
	}
	out := make([]string, 0, len(f.entries))
	for _, e := range f.entries {
		out = append(out, e.path)
	}
	return out
}

func expandHome(p, home string) string {
	if p == "~" {
		return home
	}
	if strings.HasPrefix(p, "~/") && home != "" {
		return filepath.Join(home, p[2:])
	}
	return p
}
