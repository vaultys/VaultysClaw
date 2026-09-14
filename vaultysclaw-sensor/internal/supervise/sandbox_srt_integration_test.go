package supervise

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// End-to-end against the real srt binary.
//
// Skipped when srt is absent, because a host without it is a supported state —
// the launcher reports ErrSandboxUnavailable and `sandbox: require` refuses. The
// test exists because every unit test here asserts what this package *generates*,
// and the failure this project cannot afford is a document that generates
// perfectly and enforces nothing.
func TestSRTEnforcesTheMergedSettings(t *testing.T) {
	bin, err := findSRT()
	if err != nil {
		t.Skipf("srt not installed: %v", err)
	}

	dir := t.TempDir()
	resolved, err := ResolvePath(dir, "")
	if err != nil {
		t.Fatal(err)
	}

	// Two denied paths reaching the settings by different routes: one the admin
	// wrote into the certificate's block, one only the local floor knows about.
	fromBlock := filepath.Join(resolved, "from-block")
	fromFloor := filepath.Join(resolved, "from-floor")
	allowed := filepath.Join(resolved, "allowed")
	for _, p := range []string{fromBlock, fromFloor, allowed} {
		if err := os.WriteFile(p, []byte("secret"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	spec := SandboxSpec{
		Base: []byte(`{
			"filesystem": {"denyRead": ["` + fromBlock + `"], "allowRead": [], "allowWrite": ["/"], "denyWrite": []},
			"network": {"allowedDomains": ["api.anthropic.com"], "deniedDomains": []}
		}`),
		DenyAll: []string{fromFloor},
	}
	settings, err := BuildSRTSettings(spec)
	if err != nil {
		t.Fatal(err)
	}
	settingsPath := filepath.Join(resolved, "settings.json")
	if err := os.WriteFile(settingsPath, settings, 0o600); err != nil {
		t.Fatal(err)
	}

	read := func(path string) error {
		probe := readProbeCommand(path)
		args := append([]string{"--settings", settingsPath}, probe...)
		return exec.Command(bin, args...).Run()
	}

	if err := read(fromBlock); err == nil {
		t.Error("a path denied by the certificate's own srt block was readable")
	}
	if err := read(fromFloor); err == nil {
		t.Error("a path denied only by the local floor was readable — the merge dropped it")
	}
	if err := read(allowed); err != nil {
		t.Errorf("an undenied path was not readable, so the settings deny more than they say: %v", err)
	}
}

// srt's own precedence, pinned because this project's documentation states it
// and because it differs by direction. Measured against the real binary rather
// than inferred from its README: if an srt release changes either row, an
// operator's floor or this supervisor's anti-tamper guarantee changes with it,
// and that must break a test rather than a deployment.
func TestSRTPrecedenceBetweenAllowAndDeny(t *testing.T) {
	bin, err := findSRT()
	if err != nil {
		t.Skipf("srt not installed: %v", err)
	}

	dir := t.TempDir()
	resolved, err := ResolvePath(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	sub := filepath.Join(resolved, "sub")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	nested := filepath.Join(sub, "key.txt")
	artefact := filepath.Join(resolved, "grant.token")
	for _, p := range []string{nested, artefact} {
		if err := os.WriteFile(p, []byte("original"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	run := func(t *testing.T, settings, name string, argv ...string) error {
		t.Helper()
		path := filepath.Join(resolved, name)
		if err := os.WriteFile(path, []byte(settings), 0o600); err != nil {
			t.Fatal(err)
		}
		return exec.Command(bin, append([]string{"--settings", path}, argv...)...).Run()
	}

	net := `"network":{"allowedDomains":["api.anthropic.com"],"deniedDomains":[]}`

	t.Run("a deny nested inside an allowed region stays denied", func(t *testing.T) {
		s := `{"filesystem":{"denyRead":["` + sub + `"],"allowRead":["` + resolved + `"],"allowWrite":["/"],"denyWrite":[]},` + net + `}`
		if err := run(t, s, "nested.json", readProbeCommand(nested)...); err == nil {
			t.Error("the more specific deny did not win")
		}
	})

	t.Run("an identically named path is lifted by allowRead", func(t *testing.T) {
		// Documented capability, not a hole: it mirrors Decide, where a signed
		// allow rule is evaluated before the floor. It takes an admin naming the
		// exact path in a signed certificate.
		s := `{"filesystem":{"denyRead":["` + sub + `"],"allowRead":["` + sub + `"],"allowWrite":["/"],"denyWrite":[]},` + net + `}`
		if err := run(t, s, "identical.json", readProbeCommand(nested)...); err != nil {
			t.Errorf("expected the block's allowRead to lift the deny, got %v", err)
		}
	})

	t.Run("denyWrite always beats allowWrite", func(t *testing.T) {
		// The row with no exception: a certificate must never be able to make
		// this supervisor's own artefacts writable by what it supervises.
		s := `{"filesystem":{"denyRead":[],"allowRead":[],"allowWrite":["/","` + artefact + `"],"denyWrite":["` + artefact + `"]},` + net + `}`
		if err := run(t, s, "write.json", "/bin/sh", "-c", "echo tampered > "+artefact); err == nil {
			t.Error("a block made the supervisor's own grant writable")
		}
		body, err := os.ReadFile(artefact)
		if err != nil {
			t.Fatal(err)
		}
		if string(body) != "original" {
			t.Fatalf("the artefact was modified: %q", body)
		}
	})
}

// The harness's own flags must reach the harness, not srt's option parser.
//
// This shipped broken: the wrapper emitted `srt --settings <sandbox> claude
// --settings <hook file>`, srt read the second --settings as its own on a
// last-wins basis, and refused to start because Claude Code's hook settings are
// not a sandbox configuration. Every launch failed with an error naming the
// wrong file. The old seatbelt wrapper had the separator; the port dropped it.
func TestSRTWrapDoesNotSwallowTheHarnessFlags(t *testing.T) {
	if _, err := findSRT(); err != nil {
		t.Skipf("srt not installed: %v", err)
	}

	dir := t.TempDir()
	resolved, err := ResolvePath(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	// A file that is valid JSON but not an srt config — exactly what a harness
	// settings file is. If srt reads it, it fails; if it is passed through, echo
	// simply prints the path.
	decoy := filepath.Join(resolved, "harness-settings.json")
	if err := os.WriteFile(decoy, []byte(`{"hooks":{}}`), 0o600); err != nil {
		t.Fatal(err)
	}

	sandbox, err := NewSandbox(SandboxSpec{AllowedDomains: []string{"api.anthropic.com"}}, resolved)
	if err != nil {
		t.Fatalf("NewSandbox: %v", err)
	}
	defer sandbox.Close()

	argv := sandbox.Wrap([]string{"/bin/echo", "--settings", decoy})
	out, err := exec.Command(argv[0], argv[1:]...).CombinedOutput()
	if err != nil {
		t.Fatalf("the wrapped command failed — srt most likely consumed the harness's flags: %v\n%s", err, out)
	}
	if !strings.Contains(string(out), decoy) {
		t.Errorf("the harness's own --settings did not reach it; got %q", out)
	}
}
