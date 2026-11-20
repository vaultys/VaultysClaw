package install

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vaultys/vaultysclaw-hooks/internal/adapter/claudecode"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

func userOpts(t *testing.T) (Options, string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	bin := filepath.Join(home, "bin dir", "vaultysclaw-hooks")
	if err := os.MkdirAll(filepath.Dir(bin), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(bin, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	return Options{Scope: state.ScopeUser, Binary: bin, StateDir: filepath.Join(home, "state")}, filepath.Join(home, ".claude", "settings.json")
}

func readSettings(t *testing.T, path string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

const existing = `{
  "model": "opus",
  "hooks": {
    "PreToolUse": [
      {"matcher": "Bash", "hooks": [{"type": "command", "command": "my-own-linter"}]}
    ]
  }
}`

func TestUserInstallMergesAndIsIdempotent(t *testing.T) {
	o, target := userOpts(t)
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte(existing), 0o600); err != nil {
		t.Fatal(err)
	}
	cc := claudeCode{}
	for i := 0; i < 2; i++ {
		if _, err := cc.Install(o); err != nil {
			t.Fatal(err)
		}
	}
	s := readSettings(t, target)
	if s["model"] != "opus" {
		t.Fatal("an unrelated setting was lost")
	}
	pre := s["hooks"].(map[string]any)["PreToolUse"].([]any)
	if len(pre) != 2 {
		t.Fatalf("want the operator's hook plus exactly one of ours after two installs, got %d", len(pre))
	}
	if entryCommand(pre[0], "claude-code") != "" {
		t.Fatal("the operator's own hook must be kept first and untouched")
	}
	cmd := entryCommand(pre[1], "claude-code")
	if !strings.Contains(cmd, `"`+o.Binary+`"`) || !strings.Contains(cmd, "--event=PreToolUse") {
		t.Fatalf("unexpected command %q", cmd)
	}

	chk := cc.Check(o)
	if len(chk.Missing) != 0 || len(chk.Problems) != 0 || len(chk.Installed) != len(claudecode.Events) {
		t.Fatalf("check after install: %+v", chk)
	}

	if _, err := cc.Uninstall(o); err != nil {
		t.Fatal(err)
	}
	s = readSettings(t, target)
	hooks := s["hooks"].(map[string]any)
	if len(hooks) != 1 || len(hooks["PreToolUse"].([]any)) != 1 {
		t.Fatalf("uninstall must leave exactly the operator's hook, got %v", hooks)
	}
}

func TestUninstallRemovesEmptyHooksKey(t *testing.T) {
	o, target := userOpts(t)
	cc := claudeCode{}
	if _, err := cc.Install(o); err != nil {
		t.Fatal(err)
	}
	if _, err := cc.Uninstall(o); err != nil {
		t.Fatal(err)
	}
	if _, ok := readSettings(t, target)["hooks"]; ok {
		t.Fatal("an emptied hooks object should be removed")
	}
}

func TestRefusesToRewriteUnparseableSettings(t *testing.T) {
	o, target := userOpts(t)
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("{ // a comment\n}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := (claudeCode{}).Install(o); err == nil {
		t.Fatal("must not overwrite a settings file it cannot parse")
	}
	if data, _ := os.ReadFile(target); !strings.Contains(string(data), "a comment") {
		t.Fatal("the file was modified")
	}
}

func TestCheckFlagsMissingBinary(t *testing.T) {
	o, _ := userOpts(t)
	cc := claudeCode{}
	if _, err := cc.Install(o); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(o.Binary); err != nil {
		t.Fatal(err)
	}
	if chk := cc.Check(o); len(chk.Problems) == 0 {
		t.Fatal("a hook pointing at a missing binary must be reported")
	}
}

func TestIsOurs(t *testing.T) {
	o := Options{Scope: state.ScopeMachine, Binary: "/opt/x/renamed-binary", StateDir: "/etc/vaultysclaw/hooks"}
	if !IsOurs(HookCommand(o, "claude-code", "PreToolUse"), "claude-code") {
		t.Fatal("a renamed binary must still be recognised")
	}
	for _, cmd := range []string{"my-own-linter", "other hook --vendor=claude-code", `"/x/vaultysclaw-hooks" hook --vendor=codex --event=PreToolUse --scope=user --state=/s`} {
		if IsOurs(cmd, "claude-code") {
			t.Fatalf("%q is not ours", cmd)
		}
	}
	if got := commandBinary(HookCommand(Options{Binary: "/a b/c", Scope: "user", StateDir: "/s"}, "claude-code", "Stop")); got != "/a b/c" {
		t.Fatalf("commandBinary = %q", got)
	}
}
