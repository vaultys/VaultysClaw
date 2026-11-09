package supervise

import (
	"bufio"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

// Self-protection: everything whose modification by the supervised agent would
// let it lift its own governance.
//
// The floor's own entries were never enough. The grant, anchor, settings and
// spool were write-protected, but the agent could still edit config.yaml
// (`sandbox: off`, `mode: observe`, a new anchor), delete rules.token, remove
// the decision socket, or replace the sensor or srt binary — and every one of
// those is a complete escape at the next launch, or at the next reload. This
// file is the one list of what must hold, so the sandbox profile and the
// no-sandbox refusal cannot disagree about it.

// ArtefactKind says how much around a path has to be protected.
type ArtefactKind int

const (
	// ArtefactState is a file in the supervisor's state directory. Its
	// *directory* is protected too: protecting only the file leaves deletion,
	// recreation and rename-over open wherever the mechanism allows them, and a
	// file that does not exist yet at launch (rules.token before the first push)
	// cannot be protected as a file at all.
	ArtefactState ArtefactKind = iota
	// ArtefactBinary is an executable. Only the file is protected: its directory
	// is typically ~/.local/bin or /usr/local/bin, shared with the harness's own
	// binary and its updater.
	ArtefactBinary
	// ArtefactTree is a directory protected as a whole — an installed package
	// whose entry point is only one of the files it runs.
	ArtefactTree
)

// SelfArtefact is one thing the supervised agent must not be able to modify.
type SelfArtefact struct {
	Path   string
	Reason string
	Kind   ArtefactKind
}

// SelfProtection resolves artefacts into the write-deny list for the tier-B
// profile.
//
// avoid lists paths the harness legitimately writes beneath — its working
// directory, the home directory, the temp directory, the harness binary. A
// state directory equal to or above any of them is not protected as a
// directory, only file by file: an operator who keeps the grant directly in ~
// must not get a session that cannot write anywhere in their home. The result
// is weaker for that layout (a missing file can then be created), which is why
// the defaults keep everything in a dedicated ~/.vaultysclaw-sensor.
func SelfProtection(artefacts []SelfArtefact, avoid []string) []string {
	resolvedAvoid := resolveAll(avoid)
	seen := map[string]bool{}
	var out []string
	add := func(p string) {
		if p == "" || p == string(filepath.Separator) || seen[p] {
			return
		}
		seen[p] = true
		out = append(out, p)
	}
	for _, a := range artefacts {
		if strings.TrimSpace(a.Path) == "" {
			continue
		}
		resolved, err := ResolvePath(a.Path, "")
		if err != nil || resolved == "" {
			resolved = filepath.Clean(a.Path)
		}
		switch a.Kind {
		case ArtefactState:
			add(resolved)
			if dir := filepath.Dir(resolved); !coversAny(dir, resolvedAvoid) {
				add(dir)
			}
		case ArtefactBinary:
			add(resolved)
			// The name the launcher used, when it is a symlink to the real
			// binary: repointing the link is as good as replacing the target.
			if clean := filepath.Clean(a.Path); clean != resolved && filepath.IsAbs(clean) {
				add(clean)
			}
		case ArtefactTree:
			if !coversAny(resolved, resolvedAvoid) {
				add(resolved)
			}
		}
	}
	return out
}

// coversAny reports whether dir is equal to, or an ancestor of, any of paths.
func coversAny(dir string, paths []string) bool {
	if dir == string(filepath.Separator) || dir == "." || dir == "" {
		return true
	}
	for _, p := range paths {
		if p == dir || strings.HasPrefix(p, dir+string(filepath.Separator)) {
			return true
		}
	}
	return false
}

// LocateSRT returns the srt CLI the sandbox will run, by the same lookup.
func LocateSRT() (string, error) { return findSRT() }

// SRTArtefacts is what the sandbox launcher itself is made of. Replacing any of
// it is a complete escape at the next launch: a fake srt that runs the harness
// unconfined is indistinguishable, from inside the supervisor, from a real one
// once it has learned to fail the canary read.
//
// srt is a Node script, so that means the name on PATH, the file it resolves to,
// the package it belongs to, and the interpreter its shebang names.
func SRTArtefacts(bin string) []SelfArtefact {
	out := []SelfArtefact{{Path: bin, Reason: "the sandbox-runtime (srt) launcher", Kind: ArtefactBinary}}
	resolved, err := filepath.EvalSymlinks(bin)
	if err != nil {
		return out
	}
	if root := packageRoot(resolved); root != "" {
		out = append(out, SelfArtefact{Path: root, Reason: "the sandbox-runtime (srt) package", Kind: ArtefactTree})
	}
	if interp := shebangInterpreter(resolved); interp != "" {
		out = append(out, SelfArtefact{Path: interp, Reason: "the interpreter that runs srt", Kind: ArtefactBinary})
	}
	return out
}

// packageRoot walks up from an installed package's file to the directory that
// holds its package.json. Bounded: a binary that is not inside a package must
// not end up protecting some unrelated ancestor that happens to have one.
func packageRoot(file string) string {
	dir := filepath.Dir(file)
	for i := 0; i < 4; i++ {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// shebangInterpreter returns the absolute interpreter a script's first line
// names, resolving `#!/usr/bin/env node` through PATH as env would.
func shebangInterpreter(script string) string {
	f, err := os.Open(script)
	if err != nil {
		return ""
	}
	defer f.Close()
	line, err := bufio.NewReader(f).ReadString('\n')
	if err != nil && line == "" {
		return ""
	}
	if !strings.HasPrefix(line, "#!") {
		return ""
	}
	fields := strings.Fields(strings.TrimPrefix(line, "#!"))
	if len(fields) == 0 {
		return ""
	}
	interp := fields[0]
	if filepath.Base(interp) == "env" {
		// Skip env's own options (`env -S node --flag`).
		for _, f := range fields[1:] {
			if !strings.HasPrefix(f, "-") {
				interp = f
				break
			}
		}
	}
	if !filepath.IsAbs(interp) {
		p, err := exec.LookPath(interp)
		if err != nil {
			return ""
		}
		interp = p
	}
	if r, err := filepath.EvalSymlinks(interp); err == nil {
		return r
	}
	return interp
}

// ModifiableArtefacts reports, for the no-confinement case, which artefacts the
// current uid — the uid the harness will run as — could modify.
//
// A path counts as modifiable when it, or *any* directory above it, is writable:
// a root-owned ~/.vaultysclaw-sensor is still renamed away and replaced in one
// call by a user who owns ~. That is the same rule ssh's StrictModes applies, and
// for the same reason. Conservative about sticky directories, which it treats as
// writable.
//
// The result is sorted and names the reason, so a refusal can say exactly what
// to move.
func ModifiableArtefacts(artefacts []SelfArtefact) []string {
	var out []string
	seen := map[string]bool{}
	for _, a := range artefacts {
		if strings.TrimSpace(a.Path) == "" {
			continue
		}
		p, err := filepath.Abs(a.Path)
		if err != nil {
			p = a.Path
		}
		if seen[p] {
			continue
		}
		seen[p] = true
		if writable, where := pathModifiable(p); writable {
			entry := p + " (" + a.Reason + ")"
			if where != p {
				entry += " — via the writable directory " + where
			}
			out = append(out, entry)
		}
	}
	sort.Strings(out)
	return out
}

// pathModifiable walks p and its ancestors and returns the first one the
// current uid can write.
func pathModifiable(p string) (bool, string) {
	for cur := p; ; {
		if _, err := os.Lstat(cur); err == nil && canWrite(cur) {
			return true, cur
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			return false, ""
		}
		cur = parent
	}
}
