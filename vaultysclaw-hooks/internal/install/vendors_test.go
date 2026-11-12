package install

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter/codex"
	"github.com/vaultys/vaultysclaw-hooks/internal/adapter/cursor"
)

func TestCursorInstallMergesFailsClosedAndUninstallsCleanly(t *testing.T) {
	o, _ := userOpts(t)
	in := cursorInstaller{}
	target, _ := in.Target(o.Scope)

	// Someone else's hook is already there.
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		t.Fatal(err)
	}
	other := `{"version":1,"hooks":{"preToolUse":[{"command":"./audit.sh"}]}}`
	if err := os.WriteFile(target, []byte(other), 0o600); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if _, err := in.Install(o); err != nil {
			t.Fatal(err)
		}
	}
	s := readSettings(t, target)
	pre := asSlice(hooksObject(s)["preToolUse"])
	if len(pre) != 2 {
		t.Fatalf("want the operator's entry plus exactly one of ours after two installs, got %v", pre)
	}
	ours, _ := pre[1].(map[string]any)
	if ours["failClosed"] != true {
		t.Fatalf("Cursor fails open on a crashed hook unless told otherwise: %v", ours)
	}
	chk := in.Check(o)
	if !chk.Decides || len(chk.Missing) != 0 || len(chk.Problems) != 0 {
		t.Fatalf("check = %+v", chk)
	}
	if len(chk.Gaps) == 0 {
		t.Fatal("Cursor's known blind spots must be declared, or coverage would say enforcing")
	}

	if _, err := in.Uninstall(o); err != nil {
		t.Fatal(err)
	}
	s = readSettings(t, target)
	if pre := asSlice(hooksObject(s)["preToolUse"]); len(pre) != 1 {
		t.Fatalf("uninstall must leave the operator's entry, got %v", pre)
	}
	for _, ev := range cursor.Events[1:] {
		if _, ok := hooksObject(s)[ev]; ok {
			t.Fatalf("uninstall left an empty %s", ev)
		}
	}
}

func TestCursorUninstallRemovesAFileItCreated(t *testing.T) {
	o, _ := userOpts(t)
	in := cursorInstaller{}
	target, _ := in.Target(o.Scope)
	if _, err := in.Install(o); err != nil {
		t.Fatal(err)
	}
	if _, err := in.Uninstall(o); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatal("a hooks.json holding only what install wrote must be removed")
	}
}

func TestCodexInstallIsClaudeShapedAndDeclaresUserScopeTrust(t *testing.T) {
	o, _ := userOpts(t)
	t.Setenv("CODEX_HOME", "")
	in := codexInstaller{}
	target, _ := in.Target(o.Scope)
	if filepath.Base(filepath.Dir(target)) != ".codex" {
		t.Fatalf("target = %s", target)
	}
	if _, err := in.Install(o); err != nil {
		t.Fatal(err)
	}
	pre := asSlice(hooksObject(readSettings(t, target))["PreToolUse"])
	if len(pre) != 1 || entryCommand(pre[0], codex.Vendor) == "" {
		t.Fatalf("PreToolUse = %v", pre)
	}
	if m, _ := pre[0].(map[string]any); m["matcher"] != "*" {
		t.Fatalf("PreToolUse needs a match-all matcher: %v", m)
	}
	chk := in.Check(o)
	if !chk.Decides || len(chk.Problems) != 0 {
		t.Fatalf("check = %+v", chk)
	}
	trustGap := false
	for _, g := range chk.Gaps {
		if len(g) >= 10 && g[:10] == "user-scope" {
			trustGap = true
		}
	}
	if !trustGap {
		t.Fatalf("user-scope Codex hooks need approval to run; that must be a declared gap: %v", chk.Gaps)
	}
	if _, err := in.Uninstall(o); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatal("uninstall must remove the hooks.json it created")
	}
}

func TestCodexHomeIsHonoured(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("CODEX_HOME", dir)
	target, err := codexInstaller{}.Target("user")
	if err != nil || target != filepath.Join(dir, "hooks.json") {
		t.Fatalf("target = %s, %v", target, err)
	}
}
