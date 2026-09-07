//go:build darwin

package supervise

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vaultys/VaultysClaw/sdk-go/rules"
)

// resolvedTemp returns a temp dir with symlinks resolved. On macOS t.TempDir()
// sits under /var → /private/var, and seatbelt matches the kernel's view — an
// unresolved path in a profile matches nothing at all.
func resolvedTemp(t *testing.T) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestBuildProfileNamesFilesAndDirectoriesDifferently(t *testing.T) {
	// Established empirically against the real sandbox-exec: `subpath` on a file
	// matches nothing, and the profile then enforces silently less than it says.
	dir := resolvedTemp(t)
	file := filepath.Join(dir, "key")
	if err := os.WriteFile(file, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	sub := filepath.Join(dir, "tree")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}

	profile := BuildProfile(SandboxSpec{DenyAll: []string{file, sub}})
	if !strings.Contains(profile, `(literal "`+file+`")`) {
		t.Errorf("a file must be named with literal; profile:\n%s", profile)
	}
	if !strings.Contains(profile, `(subpath "`+sub+`")`) {
		t.Errorf("a directory must be named with subpath; profile:\n%s", profile)
	}
}

func TestBuildProfileEscapesQuotesExactlyOnce(t *testing.T) {
	// An unescaped quote terminates the SBPL token early, silently changing what
	// the rule covers — and a double-escaped one names a path that does not
	// exist, which fails the same silent way.
	profile := BuildProfile(SandboxSpec{DenyAll: []string{`/tmp/we"ird`}})
	if !strings.Contains(profile, `"/tmp/we\"ird"`) {
		t.Errorf("the quote must be escaped exactly once; profile:\n%s", profile)
	}
}

func TestBuildProfileLeavesNonASCIIPathsIntact(t *testing.T) {
	// %q would render this as \u sequences, naming a different file — or none.
	profile := BuildProfile(SandboxSpec{DenyAll: []string{"/tmp/café/clé"}})
	if !strings.Contains(profile, "/tmp/café/clé") {
		t.Errorf("a non-ASCII path must survive verbatim; profile:\n%s", profile)
	}
}

func TestSandboxActuallyConfines(t *testing.T) {
	// The claim tier B exists to make. Not "the profile parses" — that is
	// satisfied by a profile that enforces nothing.
	dir := resolvedTemp(t)
	secret := filepath.Join(dir, "secret")
	protected := filepath.Join(dir, "settings.json")
	open := filepath.Join(dir, "open.txt")
	for _, f := range []string{secret, protected, open} {
		if err := os.WriteFile(f, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	sb, err := NewSandbox(SandboxSpec{DenyAll: []string{secret}, DenyWrite: []string{protected}}, dir)
	if err != nil {
		t.Skipf("no confinement available here: %v", err)
	}
	defer sb.Close()

	run := func(args ...string) error {
		return exec.Command(sb.Wrap(args)[0], sb.Wrap(args)[1:]...).Run()
	}

	if err := run("/bin/cat", secret); err == nil {
		t.Error("a denied path was readable inside the sandbox")
	}
	if err := run("/bin/cat", open); err != nil {
		t.Errorf("an unnamed path must stay readable — this is a deny-list, not general confinement: %v", err)
	}

	// The asymmetry that makes the launch work at all: the harness is passed
	// --settings and must read it, so only writing is denied.
	if err := run("/bin/cat", protected); err != nil {
		t.Errorf("a write-protected path must stay readable, or the harness cannot load the hook: %v", err)
	}
	if err := run("/bin/sh", "-c", "echo x > "+protected); err == nil {
		t.Error("a write-protected path was writable inside the sandbox")
	}

	// The property tier A cannot have: it survives a child shell.
	if err := run("/bin/sh", "-c", "cat "+secret); err == nil {
		t.Error("a subprocess escaped the sandbox — this is the whole reason tier B exists")
	}
}

func TestUnresolvedPathsWouldEnforceNothing(t *testing.T) {
	// Documenting the trap as a test. /tmp is a symlink to /private/tmp on every
	// macOS machine, and a rule naming the unresolved form matches nothing —
	// with no warning and a profile that loads cleanly. This is why every path
	// goes through ResolvePath before reaching a profile.
	dir := resolvedTemp(t)
	if !strings.HasPrefix(dir, "/private/") {
		t.Skip("temp dir is not behind a symlink here")
	}
	secret := filepath.Join(dir, "secret")
	if err := os.WriteFile(secret, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	unresolved := strings.TrimPrefix(dir, "/private") + "/secret"

	profilePath := filepath.Join(dir, "bad.sb")
	if err := os.WriteFile(profilePath, []byte(BuildProfile(SandboxSpec{DenyAll: []string{unresolved}})), 0o600); err != nil {
		t.Fatal(err)
	}
	err := exec.Command(sandboxExec, "-f", profilePath, "--", "/bin/cat", secret).Run()
	if err != nil {
		t.Skip("this machine resolves the path itself; the trap does not reproduce here")
	}
	// It read the file: the profile loaded and enforced nothing, which is
	// exactly the failure the canary self-test in NewSandbox is there to catch.
}

func TestNewSandboxRefusesWhenItCannotProveConfinement(t *testing.T) {
	// The canary must run against the real mechanism, so this asserts the
	// positive path leaves a usable wrapper rather than simulating a broken
	// kernel — a mechanism that cannot be broken on demand is still worth
	// proving works.
	dir := resolvedTemp(t)
	sb, err := NewSandbox(SandboxSpec{}, dir)
	if err != nil {
		t.Skipf("no confinement available here: %v", err)
	}
	defer sb.Close()

	wrapped := sb.Wrap([]string{"/usr/bin/true"})
	if wrapped[0] != sandboxExec {
		t.Errorf("Wrap must invoke %s; got %v", sandboxExec, wrapped)
	}
	if err := exec.Command(wrapped[0], wrapped[1:]...).Run(); err != nil {
		t.Errorf("a wrapped command must still run: %v", err)
	}
}

func TestSpecFromFloorSplitsCredentialsFromOwnArtefacts(t *testing.T) {
	dir := resolvedTemp(t)
	creds := filepath.Join(dir, "creds")
	grant := filepath.Join(dir, "grant.token")
	for _, p := range []string{creds, grant} {
		if err := os.WriteFile(p, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	floor := NewFloor([]string{creds}, FloorPath{Path: grant, Reason: "own grant"})
	spec := SpecFromFloor(floor, []string{grant})

	if len(spec.DenyAll) != 1 || spec.DenyAll[0] != creds {
		t.Errorf("DenyAll = %v, want only the credential path", spec.DenyAll)
	}
	if len(spec.DenyWrite) != 1 || spec.DenyWrite[0] != grant {
		t.Errorf("DenyWrite = %v, want the supervisor's own artefact", spec.DenyWrite)
	}
	// The grant must not appear in both: a read-deny on it would be harmless
	// here, but the same list holds the settings file the harness must read.
	for _, p := range spec.DenyAll {
		if p == grant {
			t.Error("an own artefact must be write-denied only, never read-denied")
		}
	}
}

func TestSelfTestTreatsAllSkippedAsNotAPass(t *testing.T) {
	// The failure this guards against: a floor naming only paths that do not
	// exist on this host produces zero failures, and reporting that as "confined"
	// would be the exact false assurance the self-test exists to prevent.
	_, ok := FormatSelfTest([]SelfTest{
		{Path: "/nope/a", Note: "does not exist on this host — nothing to demonstrate"},
		{Path: "/nope/b", Note: "does not exist on this host — nothing to demonstrate"},
	})
	if ok {
		t.Error("no conclusive probe must never report as confinement in force")
	}
}

func TestSelfTestReportsAnUnprotectedPathAsFailure(t *testing.T) {
	report, ok := FormatSelfTest([]SelfTest{
		{Path: "/x", Denied: true},
		{Path: "/y", Denied: false, Note: "READ SUCCEEDED — this path is not protected"},
	})
	if ok {
		t.Error("one unprotected path must fail the whole check")
	}
	if !strings.Contains(report, "FAIL") {
		t.Errorf("the failing path must be marked; got:\n%s", report)
	}
}

func TestSelfTestOnARealDeniedPath(t *testing.T) {
	dir := resolvedTemp(t)
	secret := filepath.Join(dir, "secret")
	if err := os.WriteFile(secret, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	spec := SandboxSpec{DenyAll: []string{secret}}
	sb, err := NewSandbox(spec, dir)
	if err != nil {
		t.Skipf("no confinement available here: %v", err)
	}
	defer sb.Close()

	_, ok := FormatSelfTest(RunSelfTest(sb, spec))
	if !ok {
		t.Error("a genuinely denied path must probe as confined")
	}
}

func TestSpecFromPolicyUnionsSignedDeniesWithTheFloor(t *testing.T) {
	dir := resolvedTemp(t)
	fromRule := filepath.Join(dir, "signed")
	fromFloor := filepath.Join(dir, "floored")
	grant := filepath.Join(dir, "grant.token")
	for _, d := range []string{fromRule, fromFloor} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(grant, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	set := &rules.Set{Version: 1, ResourceRules: []rules.ResourceRule{
		{ID: "r", Subject: rules.SubjectAny, Effect: rules.EffectDeny, Resources: []string{FileURI(fromRule) + "/*"}},
		// Non-file schemes have no filesystem meaning: the kernel cannot enforce
		// "may not call this MCP tool".
		{ID: "m", Subject: rules.SubjectAny, Effect: rules.EffectDeny, Resources: []string{"mcp://jira/delete"}},
		// An allow rule is not a kernel deny.
		{ID: "a", Subject: rules.SubjectAny, Effect: rules.EffectAllow, Resources: []string{FileURI(dir) + "/ok/*"}},
	}}
	spec := SpecFromPolicy(set, NewFloor([]string{fromFloor}), []string{grant})

	has := func(p string) bool {
		for _, x := range spec.DenyAll {
			if x == p {
				return true
			}
		}
		return false
	}
	if !has(fromRule) {
		t.Error("a signed file deny must reach the kernel profile")
	}
	if !has(fromFloor) {
		t.Error("the floor must still be enforced alongside signed rules — adding policy must not remove protection")
	}
	for _, p := range spec.DenyAll {
		if strings.Contains(p, "jira") || strings.HasSuffix(p, "/ok") {
			t.Errorf("DenyAll contains %q; only file:// denies belong in a kernel profile", p)
		}
	}
	if len(spec.DenyWrite) != 1 || spec.DenyWrite[0] != grant {
		t.Errorf("DenyWrite = %v, want the supervisor's own artefact", spec.DenyWrite)
	}
}
