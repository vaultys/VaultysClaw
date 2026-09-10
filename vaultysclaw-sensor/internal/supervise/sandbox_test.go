package supervise

import (
	"os"
	"path/filepath"
	"testing"
)

// The failure this guards against is not a wrong decision but an unexplained
// one: sandbox-exec reports `execvp() … Operation not permitted` and nothing in
// it names the deny list, so a home-directory-wide rule looks like a broken
// supervisor rather than a rule that covers more than its author meant.
func TestSpecDeniesExecutable(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	resolvedHome, err := ResolvePath(home, "")
	if err != nil {
		t.Fatal(err)
	}

	bin := filepath.Join(home, ".local", "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	harness := filepath.Join(bin, "claude")
	if err := os.WriteFile(harness, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	spec := SandboxSpec{
		DenyAll: []string{resolvedHome},
		// Write-protected, never read-denied: the harness must read the settings
		// file to install the hook at all.
		DenyWrite: []string{filepath.Join(resolvedHome, "settings.json")},
	}
	denied, entry := spec.DeniesExecutable(harness)
	if !denied {
		t.Fatal("a deny on the whole home directory covers the harness binary beneath it")
	}
	if entry != resolvedHome {
		t.Fatalf("named %q as the responsible entry, want %q — an operator cannot fix a rule they are not shown", entry, resolvedHome)
	}
}

func TestSpecAllowsAnExecutableOutsideTheDenyList(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	resolved, err := ResolvePath(home, "")
	if err != nil {
		t.Fatal(err)
	}

	// A credential deny, which is the normal case: it must not block a launch.
	spec := SandboxSpec{DenyAll: []string{filepath.Join(resolved, ".ssh")}}
	if denied, entry := spec.DeniesExecutable("/usr/bin/true"); denied {
		t.Fatalf("refused a launch over the unrelated entry %q", entry)
	}
}

// A write-deny permits reads and execution, so it must never block a launch —
// this supervisor's own artefacts are all on that list.
func TestSpecDenyWriteDoesNotBlockExecution(t *testing.T) {
	t.Parallel()
	spec := SandboxSpec{DenyWrite: []string{"/usr/bin"}}
	if denied, entry := spec.DeniesExecutable("/usr/bin/true"); denied {
		t.Fatalf("a write-protected path blocked execution, via entry %q", entry)
	}
}

// By segment, not by string prefix: the trap Floor.Refuses documents.
func TestSpecDeniesExecutableMatchesBySegment(t *testing.T) {
	t.Parallel()
	base := t.TempDir()
	resolved, err := ResolvePath(base, "")
	if err != nil {
		t.Fatal(err)
	}

	for _, dir := range []string{"agent", "agent-old"} {
		if err := os.MkdirAll(filepath.Join(base, dir), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(base, dir, "claude"), []byte("#!/bin/sh\n"), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	spec := SandboxSpec{DenyAll: []string{filepath.Join(resolved, "agent")}}
	if denied, _ := spec.DeniesExecutable(filepath.Join(base, "agent", "claude")); !denied {
		t.Error("the harness inside the denied directory was not caught")
	}
	if denied, entry := spec.DeniesExecutable(filepath.Join(base, "agent-old", "claude")); denied {
		t.Errorf("agent-old is not beneath agent — a string-prefix match wrongly blamed %q", entry)
	}
}

func TestSpecDeniesExecutableIgnoresAnEmptyPath(t *testing.T) {
	t.Parallel()
	spec := SandboxSpec{DenyAll: []string{"/"}}
	if denied, _ := spec.DeniesExecutable(""); denied {
		t.Error("an unresolvable harness path is BuildLaunch's error to report, not a confinement refusal")
	}
}

// The case that made the first version of this check useless. A coding harness
// is typically launched through a symlink — `~/.local/bin/claude` points at a
// versioned directory under `~/.local/share` — so resolving the path first and
// checking only the result reports the launch as fine and then leaves the
// kernel to refuse it with `execvp() … Operation not permitted`.
func TestSpecDeniesExecutableReachedThroughASymlink(t *testing.T) {
	t.Parallel()
	base := t.TempDir()
	resolved, err := ResolvePath(base, "")
	if err != nil {
		t.Fatal(err)
	}

	// The real binary, outside anything denied.
	versions := filepath.Join(base, "share", "claude", "versions")
	if err := os.MkdirAll(versions, 0o755); err != nil {
		t.Fatal(err)
	}
	real := filepath.Join(versions, "2.1.266")
	if err := os.WriteFile(real, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	// The denied directory holds only the symlink.
	bin := filepath.Join(base, "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(bin, "claude")
	if err := os.Symlink(real, link); err != nil {
		t.Fatal(err)
	}

	spec := SandboxSpec{DenyAll: []string{filepath.Join(resolved, "bin")}}
	denied, entry := spec.DeniesExecutable(link)
	if !denied {
		t.Fatal("the exec path is inside the denied directory; the symlink target being outside it does not lift the deny")
	}
	if entry != filepath.Join(resolved, "bin") {
		t.Fatalf("blamed %q", entry)
	}
}

// The mirror image: denied where the binary really lives, reached through a
// symlink from a permitted directory. The kernel refuses this one too.
func TestSpecDeniesExecutableWhoseTargetIsDenied(t *testing.T) {
	t.Parallel()
	base := t.TempDir()
	resolved, err := ResolvePath(base, "")
	if err != nil {
		t.Fatal(err)
	}

	hidden := filepath.Join(base, "share")
	if err := os.MkdirAll(hidden, 0o755); err != nil {
		t.Fatal(err)
	}
	real := filepath.Join(hidden, "claude")
	if err := os.WriteFile(real, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	bin := filepath.Join(base, "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(bin, "claude")
	if err := os.Symlink(real, link); err != nil {
		t.Fatal(err)
	}

	spec := SandboxSpec{DenyAll: []string{filepath.Join(resolved, "share")}}
	if denied, _ := spec.DeniesExecutable(link); !denied {
		t.Fatal("the resolved binary is inside the denied directory")
	}
}
