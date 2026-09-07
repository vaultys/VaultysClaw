package supervise

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/vaultys/VaultysClaw/sdk-go/rules"
)

// Tier B: OS confinement (docs/HARNESS_SUPERVISOR.md §6).
//
// **What this is.** The safety floor, enforced by the kernel instead of by a
// hook the agent can route around. Tier A refuses a floor path with a reason the
// model can read; tier B makes the same refusal survive `bash -c`, a subprocess,
// a rewritten harness config, and the supervisor being killed mid-session. The
// two share one Floor deliberately: an operator configures the deny list once,
// and gets the reasoned refusal and the unbypassable one from the same entry.
//
// **What this is not.** It is not general confinement. The profile starts from
// `(allow default)` and denies specific paths, so everything not named is
// permitted — a deny-list, not an allow-list. A real allow-list profile has to
// enumerate everything a coding harness legitimately touches (node, git, its own
// state directory, three cache trees, the system libraries) and is the sort of
// thing that ships broken, gets switched off, and protects nothing. Phase 2a is
// the increment that is worth having on its own: §7's anti-tamper requirements,
// made true. A general sandbox is a later, larger piece of work and this package
// must not claim to be one.

// SandboxSpec is what the platform backend must enforce.
type SandboxSpec struct {
	// DenyAll are paths the harness may neither read nor write — the floor's
	// credential entries.
	DenyAll []string
	// DenyWrite are paths the harness may read but never modify: this
	// supervisor's own grant, trust anchor, generated settings and audit spool.
	//
	// Read is deliberately still permitted, and not as a concession. The harness
	// is launched with `--settings <that file>` and must read it to install the
	// hook at all, so a read-deny here would break the launch outright — the
	// gate would be denied to the very process it governs. Write is the property
	// that matters: §7's requirement that a supervisor's own configuration not
	// be editable by what it supervises.
	DenyWrite []string
}

// Sandbox is a prepared confinement, ready to wrap a command.
type Sandbox struct {
	// Wrap returns argv for running command under confinement.
	Wrap func(command []string) []string
	// Description is what to log — the mechanism and what it covers.
	Description string
	// cleanup removes any generated profile.
	cleanup func()
}

// Close releases the sandbox's temporary state.
func (s *Sandbox) Close() {
	if s != nil && s.cleanup != nil {
		s.cleanup()
	}
}

// ErrSandboxUnavailable means this platform has no tier-B backend built yet, so
// supervision stays advisory. It is a distinct error rather than a silent
// fallback because "we tried to confine and could not" and "we never tried" must
// not look the same to an operator.
type ErrSandboxUnavailable struct{ Platform, Why string }

func (e ErrSandboxUnavailable) Error() string {
	return fmt.Sprintf("supervise: no OS confinement backend for %s: %s", e.Platform, e.Why)
}

// SpecFromPolicy derives the confinement spec from whatever policy is actually
// in force.
//
// **Signed rules are the source of truth.** Every `file://` deny rule in the
// verified rule set becomes a kernel-enforced deny, so an admin who writes
// "deny file:///Users/fx/.ssh/*" in the console gets both the reasoned refusal
// at the tool boundary and the unbypassable one — from one authored rule, with
// no host-local list to keep in sync.
//
// The local floor is enforced **as well**, not instead. It is a union rather
// than a replacement for the same reason the decider evaluates both: making the
// floor step aside once any rule set exists would mean an admin adding an
// unrelated rule — "deny exec://docker" — silently drops the ~/.ssh protection
// nobody knew they were relying on. Adding policy must not remove protection.
//
// A floor entry is still liftable: a signed `allow` rule is evaluated before the
// floor in the decider. The kernel profile is coarser and cannot express that,
// so a path allowed by rule but named by the floor stays kernel-denied — the
// conservative direction, and one the startup log names.
//
// The supervisor's own artefacts are added unconditionally under both. Those are
// not policy — a supervisor whose grant, anchor and hook settings are writable
// by what it supervises is not supervising anything, and no admin should have to
// remember to say so.
func SpecFromPolicy(ruleSet *rules.Set, floor *Floor, ownArtefacts []string) SandboxSpec {
	spec := SandboxSpec{DenyWrite: resolveAll(ownArtefacts)}
	own := map[string]bool{}
	for _, p := range spec.DenyWrite {
		own[p] = true
	}

	seen := map[string]bool{}
	for _, p := range append(signedFileDenies(ruleSet), floor.Paths()...) {
		if own[p] || seen[p] {
			continue
		}
		seen[p] = true
		spec.DenyAll = append(spec.DenyAll, p)
	}
	return spec
}

// signedFileDenies extracts the filesystem paths a verified rule set denies.
//
// `subject: any` only. A subject-scoped rule cannot be evaluated by this role at
// all (there is no workload attribution), and the kernel has no notion of a
// subject either — enforcing one here would apply it to every process, which is
// broader than the rule says and therefore not that rule.
//
// A trailing "/*" is dropped so the pattern names a directory the profile can
// take as a subtree. An exact URI names one file. Anything else — a pattern the
// rule format does not permit — cannot occur, because the set was verified.
func signedFileDenies(set *rules.Set) []string {
	if set == nil {
		return nil
	}
	var out []string
	for _, r := range set.ResourceRules {
		if r.Effect != rules.EffectDeny || r.Subject != rules.SubjectAny {
			continue
		}
		for _, pattern := range r.Resources {
			path, ok := filePathFromURI(strings.TrimSuffix(pattern, "/*"))
			if ok {
				out = append(out, path)
			}
		}
	}
	return out
}

// filePathFromURI turns a file:// resource back into a path. Non-file schemes —
// exec://, mcp://, https:// — have no filesystem meaning and are skipped: the
// kernel cannot enforce "may not call this MCP tool".
func filePathFromURI(resource string) (string, bool) {
	u, err := url.Parse(resource)
	if err != nil || u.Scheme != "file" || u.Path == "" {
		return "", false
	}
	return u.Path, true
}

func resolveAll(paths []string) []string {
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		if strings.TrimSpace(p) == "" {
			continue
		}
		resolved, err := ResolvePath(p, "")
		if err != nil || resolved == "" {
			resolved = filepath.Clean(p)
		}
		out = append(out, resolved)
	}
	return out
}

// SpecFromFloor is SpecFromPolicy with no signed rules — the unprovisioned case.
func SpecFromFloor(floor *Floor, ownArtefacts []string) SandboxSpec {
	own := map[string]bool{}
	var spec SandboxSpec
	for _, p := range ownArtefacts {
		resolved, err := ResolvePath(p, "")
		if err != nil || resolved == "" {
			resolved = filepath.Clean(p)
		}
		if strings.TrimSpace(p) == "" {
			continue
		}
		own[resolved] = true
		spec.DenyWrite = append(spec.DenyWrite, resolved)
	}
	for _, p := range floor.Paths() {
		if !own[p] {
			spec.DenyAll = append(spec.DenyAll, p)
		}
	}
	return spec
}

// pathKind reports how a path must be named in a profile. This distinction is
// not cosmetic: naming a file as a directory subtree matches nothing at all, and
// the resulting profile enforces silently nothing — verified against the real
// sandbox-exec, which is also why NewSandbox self-tests before any launch.
func pathKind(path string) (isDir bool) {
	info, err := os.Stat(path)
	if err != nil {
		// A path that does not exist yet: treat it as a directory only if it has
		// no extension, which is a guess — and a guess is why the canary
		// self-test exists rather than trusting this.
		return filepath.Ext(path) == ""
	}
	return info.IsDir()
}
