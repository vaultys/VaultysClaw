package install

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter/cline"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

func TestCopilotOwnFileAndPowerShellCallOperator(t *testing.T) {
	o, _ := userOpts(t)
	t.Setenv("COPILOT_HOME", "")
	in := copilotInstaller{}
	target, _ := in.Target(o.Scope)
	if _, err := in.Install(o); err != nil {
		t.Fatal(err)
	}
	s := readSettings(t, target)
	if v, _ := s["version"].(float64); v != 1 {
		t.Fatalf("Copilot rejects a hooks file without version 1: %v", s)
	}
	pre, _ := asSlice(hooksObject(s)["preToolUse"])[0].(map[string]any)
	if !IsOurs(pre["bash"].(string), "copilot") || !strings.HasPrefix(pre["powershell"].(string), "& ") {
		t.Fatalf("entry = %v", pre)
	}
	if chk := in.Check(o); !chk.Decides || len(chk.Problems) != 0 {
		t.Fatalf("check = %+v", chk)
	}
	if _, err := in.Uninstall(o); err != nil {
		t.Fatal(err)
	}
	if exists(target) {
		t.Fatal("uninstall must remove our file")
	}
}

func TestGeminiNamesHooksAndSeesThemDisabled(t *testing.T) {
	o, _ := userOpts(t)
	t.Setenv("GEMINI_CLI_SYSTEM_SETTINGS_PATH", filepath.Join(t.TempDir(), "system.json"))
	in := geminiInstaller{}
	target, _ := in.Target(o.Scope)
	if _, err := in.Install(o); err != nil {
		t.Fatal(err)
	}
	entry, _ := asSlice(hooksObject(readSettings(t, target))["BeforeTool"])[0].(map[string]any)
	hook, _ := asSlice(entry["hooks"])[0].(map[string]any)
	if hook["name"] != "vaultysclaw-hooks-beforetool" || hook["timeout"].(float64) != geminiTimeoutMs {
		t.Fatalf("hook = %v (timeout is in milliseconds in Gemini)", hook)
	}
	if chk := in.Check(o); !chk.Decides || len(chk.Problems) != 0 {
		t.Fatalf("check = %+v", chk)
	}

	s := readSettings(t, target)
	s["hooksConfig"] = map[string]any{"disabled": []any{"vaultysclaw-hooks-beforetool"}}
	if err := writeJSONAtomic(target, s, 0o600, 0o700); err != nil {
		t.Fatal(err)
	}
	if chk := in.Check(o); len(chk.Problems) == 0 {
		t.Fatal("a hook disabled by name must be reported, or coverage would say governed")
	}
}

func TestClineScriptsRefuseToClobberAndSkipMachineScope(t *testing.T) {
	o, _ := userOpts(t)
	in := clineInstaller{}
	dir, _ := in.Target(o.Scope)

	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	theirs := clineFile(dir, "PostToolUse")
	if err := os.WriteFile(theirs, []byte("#!/bin/sh\necho mine\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := in.Install(o); err == nil {
		t.Fatal("an existing hook file that is not ours must stop the install")
	}
	if exists(clineFile(dir, "PreToolUse")) {
		t.Fatal("a refused install writes nothing")
	}
	if err := os.Remove(theirs); err != nil {
		t.Fatal(err)
	}

	if _, err := in.Install(o); err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" {
		info, _ := os.Stat(clineFile(dir, "PreToolUse"))
		if info.Mode().Perm()&0o111 == 0 {
			t.Fatal("Cline skips hook files that are not executable")
		}
	}
	chk := in.Check(o)
	if !chk.Decides || len(chk.Installed) != len(cline.Events) || len(chk.Gaps) == 0 {
		t.Fatalf("check = %+v", chk)
	}
	if _, err := in.Uninstall(o); err != nil {
		t.Fatal(err)
	}
	if exists(clineFile(dir, "PreToolUse")) {
		t.Fatal("uninstall must remove our hook files")
	}

	m := o
	m.Scope = state.ScopeMachine
	res, err := in.Install(m)
	if err != nil || res.Changed || len(res.Notes) == 0 {
		t.Fatalf("machine scope must be skipped, saying why: %+v %v", res, err)
	}
	if chk := in.Check(m); chk.Decides || len(chk.Problems) == 0 {
		t.Fatalf("at machine scope Cline is ungoverned, and must say why: %+v", chk)
	}
}
