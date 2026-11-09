package supervise

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSelfProtectionCoversTheStateDirectoryAndTheBinaries(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	home := filepath.Join(root, "home")
	state := filepath.Join(home, ".vaultysclaw-sensor")
	bin := filepath.Join(home, ".local", "bin")
	repo := filepath.Join(home, "repo")
	for _, d := range []string{state, bin, repo} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	self := filepath.Join(bin, "vaultysclaw-sensor")
	if err := os.WriteFile(self, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	harness := filepath.Join(bin, "claude")

	got := SelfProtection([]SelfArtefact{
		{Path: filepath.Join(state, "config.yaml"), Kind: ArtefactState},
		// Absent at launch, as it is before the first push: only the
		// directory can stop it being created, and that is what must hold.
		{Path: filepath.Join(state, "rules.token"), Kind: ArtefactState},
		{Path: filepath.Join(state, "supervise.sock"), Kind: ArtefactState},
		{Path: self, Kind: ArtefactBinary},
	}, []string{repo, home, harness})

	for _, want := range []string{state, filepath.Join(state, "config.yaml"), self} {
		if !contains(got, want) {
			t.Errorf("%s is not write-protected; got %v", want, got)
		}
	}
	if contains(got, bin) {
		t.Errorf("the binary's directory %s is shared with the harness and must not be protected whole", bin)
	}
}

func TestSelfProtectionNeverLocksTheHarnessOutOfItsOwnTree(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	home := filepath.Join(root, "home")
	repo := filepath.Join(home, "repo")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	// A grant kept directly in ~ and a config in the repo: protecting their
	// directories would make the whole home, or the project, read-only.
	got := SelfProtection([]SelfArtefact{
		{Path: filepath.Join(home, "grant.token"), Kind: ArtefactState},
		{Path: filepath.Join(repo, "sensor.yaml"), Kind: ArtefactState},
	}, []string{repo, home})
	if contains(got, home) || contains(got, repo) {
		t.Fatalf("protected a directory the harness works in: %v", got)
	}
	if !contains(got, filepath.Join(home, "grant.token")) || !contains(got, filepath.Join(repo, "sensor.yaml")) {
		t.Errorf("the files themselves must still be protected: %v", got)
	}
}

func TestSRTArtefactsIncludeThePackageAndItsInterpreter(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	pkg := filepath.Join(root, "lib", "node_modules", "sandbox-runtime")
	if err := os.MkdirAll(filepath.Join(pkg, "dist"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(pkg, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	interp := filepath.Join(root, "bin", "node")
	if err := os.MkdirAll(filepath.Dir(interp), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(interp, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	cli := filepath.Join(pkg, "dist", "cli.js")
	if err := os.WriteFile(cli, []byte("#!"+interp+"\nconsole.log(1)\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "bin", "srt")
	if err := os.Symlink(cli, link); err != nil {
		t.Fatal(err)
	}

	paths := map[string]bool{}
	for _, a := range SRTArtefacts(link) {
		paths[a.Path] = true
	}
	for _, want := range []string{link, pkg, interp} {
		if !paths[want] {
			t.Errorf("%s is missing from srt's protected set: %v", want, paths)
		}
	}
}

func TestModifiableArtefactsSeesAWritableAncestor(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root can write anything; the check is meaningless")
	}
	dir := t.TempDir()
	locked := filepath.Join(dir, "locked")
	if err := os.MkdirAll(locked, 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := filepath.Join(locked, "config.yaml")
	if err := os.WriteFile(cfg, []byte("x"), 0o444); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(locked, 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(locked, 0o755) })

	// The file and its directory are read-only — but the directory above is
	// ours, so the whole directory can be renamed away and replaced.
	got := ModifiableArtefacts([]SelfArtefact{{Path: cfg, Reason: "config"}})
	if len(got) != 1 || !strings.Contains(got[0], "via the writable directory "+dir) {
		t.Fatalf("got %v, want the config reported through its writable ancestor %s", got, dir)
	}
}

func TestHookCommandFailsClosedUnlessToldOtherwise(t *testing.T) {
	if cmd := hookCommand("/bin/vc", "/s.sock", false); strings.Contains(cmd, "--fail-open") {
		t.Errorf("explicit launch wrote a fail-open hook: %s", cmd)
	}
	if cmd := hookCommand("/bin/vc", "/s.sock", true); !strings.HasSuffix(cmd, " --fail-open") {
		t.Errorf("observe launch did not mark the hook fail-open: %s", cmd)
	}
}
