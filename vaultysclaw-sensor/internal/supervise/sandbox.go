package supervise

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
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

	// AllowedDomains is the egress allow-list, from the certificate's own
	// allowedDomains. DeniedDomains overrides it, and carries the signed
	// `deny https://…` rules the tool boundary already enforces — authored once,
	// enforced both at the tool call and below it.
	//
	// This half has no predecessor: the seatbelt profile this replaces covered
	// the filesystem and nothing else, so a certificate's domain scope was
	// advisory for this role. It is now the kernel's.
	AllowedDomains []string
	DeniedDomains  []string

	// Base is the `srt` block from the certificate's resourceLimits, in srt's
	// own schema, as authored by the admin who issued the grant.
	//
	// Carried as raw JSON and merged rather than parsed into fields: srt owns
	// this schema, and a Go mirror of it would go stale against a third-party
	// research preview in the one direction that matters — an unrecognised key
	// would decode to nothing, and a confinement an admin wrote would silently
	// not be enforced. Unknown keys are passed through untouched.
	//
	// It is a *base*, not the final settings: DenyAll and DenyWrite are merged
	// into it and are not removable by it. See BuildSRTSettings.
	Base []byte

	// NetworkUnrestricted marks a certificate that places no limit on egress.
	//
	// It is a distinct state rather than an empty AllowedDomains, which means
	// the opposite — deny everything. The backend refuses to build a sandbox for
	// it, because the mechanism cannot express "no limit" and the alternatives
	// are both wrong: inventing a domain list is policy nobody signed, and
	// treating it as deny-all would silently break every harness whose admin
	// asked for the least restriction, not the most.
	NetworkUnrestricted bool
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
// Platform is empty when the cause is not the platform at all — the tool is
// missing, or the policy cannot be expressed. Naming a platform in those cases
// sends an operator looking for a port that exists.
type ErrSandboxUnavailable struct{ Platform, Why string }

func (e ErrSandboxUnavailable) Error() string {
	if e.Platform == "" {
		return "supervise: OS confinement could not be established: " + e.Why
	}
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
func SpecFromPolicy(ruleSet *rules.Set, floor *Floor, ownArtefacts []string, certs []authz.Certificate) SandboxSpec {
	spec := SandboxSpec{DenyWrite: resolveAll(ownArtefacts)}
	spec.Base = certSRTBlock(certs)
	spec.AllowedDomains, spec.NetworkUnrestricted = domainScope(certs)
	spec.DeniedDomains = signedHostDenies(ruleSet)
	// A block that states its own egress scope answers the question
	// allowedDomains would have: the admin wrote it into the grant deliberately,
	// and it is the more expressive of the two.
	if baseDeclaresNetwork(spec.Base) {
		spec.NetworkUnrestricted = false
	}
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

// domainScope reads the egress allow-list off the certificate, and reports
// whether there is one at all.
//
// An absent or empty AllowedDomains means *no limit* — the same reading
// intercept.domainsFor gives it, and the two must not drift. It is returned as
// the unrestricted flag rather than as an empty list because an empty list means
// the opposite downstream: deny everything.
//
// Only the first certificate is consulted, matching the control plane's own
// rule that an interception point's authority is its single grant.
func domainScope(certs []authz.Certificate) (domains []string, unrestricted bool) {
	for _, cert := range certs {
		if cert.ResourceLimits == nil || len(cert.ResourceLimits.AllowedDomains) == 0 {
			return nil, true
		}
		return append([]string{}, cert.ResourceLimits.AllowedDomains...), false
	}
	// No certificate at all: this host authorizes nothing yet, and a domain list
	// cannot be invented for it.
	return nil, true
}

// certSRTBlock returns the certificate's `srt` block, or nil when it carries
// none. Only the first certificate is consulted, for the reason domainScope
// gives: an interception point's authority is its single grant.
func certSRTBlock(certs []authz.Certificate) []byte {
	for _, cert := range certs {
		if cert.ResourceLimits == nil || len(cert.ResourceLimits.SRT) == 0 {
			return nil
		}
		return append([]byte{}, cert.ResourceLimits.SRT...)
	}
	return nil
}

// baseDeclaresNetwork reports whether the block sets an egress scope of its own.
//
// Presence of the key is what counts, not whether the list has entries: an
// explicitly empty allowedDomains means "deny everything", which is a scope, and
// the strictest one. Only a block that says nothing at all falls back to the
// certificate's allowedDomains.
func baseDeclaresNetwork(base []byte) bool {
	if len(base) == 0 {
		return false
	}
	var doc struct {
		Network *struct {
			AllowedDomains *[]string `json:"allowedDomains"`
		} `json:"network"`
	}
	if err := json.Unmarshal(base, &doc); err != nil {
		return false
	}
	return doc.Network != nil && doc.Network.AllowedDomains != nil
}

// signedHostDenies extracts the hostnames a verified rule set denies, so a
// signed `deny https://vaultys.com` is refused below the tool boundary as well
// as at it.
//
// `subject: any` only, for the reason signedFileDenies gives: this role cannot
// evaluate a subject-scoped rule, and the enforcement layer beneath it has no
// notion of a subject either.
//
// The port is dropped. srt matches a bare hostname on every port and takes an
// optional ":port" suffix, but a rule's resource URI carries a *scheme* whose
// default port is implied rather than written — turning https:// into ":443"
// would silently stop denying the same host on any other port, which is less
// than the rule says.
func signedHostDenies(set *rules.Set) []string {
	if set == nil {
		return nil
	}
	var out []string
	seen := map[string]bool{}
	for _, r := range set.ResourceRules {
		if r.Effect != rules.EffectDeny || r.Subject != rules.SubjectAny {
			continue
		}
		for _, pattern := range r.Resources {
			u, err := url.Parse(strings.TrimSuffix(pattern, "/*"))
			if err != nil || u.Hostname() == "" {
				continue
			}
			if u.Scheme != "http" && u.Scheme != "https" {
				continue
			}
			if host := u.Hostname(); !seen[host] {
				seen[host] = true
				out = append(out, host)
			}
		}
	}
	return out
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

// SpecFromFloor is SpecFromPolicy with no signed rules — the unprovisioned case,
// and what `sandbox-check` diagnoses with.
//
// Egress is denied outright rather than left unrestricted. That is not a policy
// decision about real traffic: this spec never governs a harness, only a
// diagnostic probe that reads files, and denying everything keeps the check
// runnable on a host with no certificate instead of refusing for want of a
// domain list it has no way to obtain.
func SpecFromFloor(floor *Floor, ownArtefacts []string) SandboxSpec {
	own := map[string]bool{}
	spec := SandboxSpec{AllowedDomains: []string{}, DeniedDomains: []string{}}
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

// DeniesExecutable reports whether this profile would prevent the harness from
// being executed at all, and names the entry responsible.
//
// This is a launch-blocking misconfiguration rather than a working confinement,
// and it has to be caught here because the way it surfaces otherwise is
// `sandbox-exec: execvp() of '…/claude' failed: Operation not permitted` and an
// exit code — which names neither the deny list nor the rule that produced it.
// A `deny file:///Users/someone/*` rule authored to keep an agent out of a home
// directory also covers the harness binary sitting in `~/.local/bin`, and the
// kernel cannot tell the two intentions apart.
//
// Only DenyAll is consulted: DenyWrite still permits reads, and this
// supervisor's own artefacts are write-protected precisely so the harness can
// go on reading the settings file that installs the hook.
//
// The profile is deliberately not adjusted to let the exec through. Silently
// carving the harness path out of an admin's signed deny would enforce
// something nobody authored, and the operator would never learn their rule
// means more than they think.
func (s SandboxSpec) DeniesExecutable(path string) (bool, string) {
	if path == "" {
		return false, ""
	}
	// Both the path as written and the path after resolving symlinks, because
	// either one being denied is enough to stop the exec — and for a coding
	// harness the two routinely differ. `~/.local/bin/claude` is a symlink to a
	// versioned directory under `~/.local/share`, so a deny on `~/.local/bin`
	// catches the exec while the resolved target sits outside it entirely.
	// Resolving first and checking only the result reports such a launch as
	// fine and then watches the kernel refuse it.
	// Three forms of the same path, because a deny on any of them stops the
	// exec and the entries were themselves resolved when the spec was built:
	//
	//   1. as written, for the ordinary case where nothing is a symlink;
	//   2. with its *directory* resolved but the final component left alone —
	//      the one that matters, since `exec` traverses the directory it is in
	//      whatever the leaf points at, and a denied entry may be reachable only
	//      through a resolved ancestor (`/var` → `/private/var`);
	//   3. fully resolved, for a link *into* a denied directory.
	candidates := []string{filepath.Clean(path)}
	add := func(candidate string) {
		if candidate == "" {
			return
		}
		for _, existing := range candidates {
			if existing == candidate {
				return
			}
		}
		candidates = append(candidates, candidate)
	}
	dir, leaf := filepath.Split(filepath.Clean(path))
	if resolvedDir, err := ResolvePath(filepath.Clean(dir), ""); err == nil && resolvedDir != "" {
		add(filepath.Join(resolvedDir, leaf))
	}
	if resolved, err := ResolvePath(path, ""); err == nil {
		add(resolved)
	}
	for _, entry := range s.DenyAll {
		for _, candidate := range candidates {
			if pathWithin(candidate, entry) {
				return true, entry
			}
		}
	}
	return false, ""
}

// pathWithin reports whether path is entry or sits beneath it.
//
// By path segment, never by string prefix — the same rule Floor.Refuses is
// careful about, for the same reason: "/Users/fx-old" is not beneath "/Users/fx"
// and a plain HasPrefix would say it is.
func pathWithin(path, entry string) bool {
	return path == entry || strings.HasPrefix(path, entry+string(os.PathSeparator))
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
