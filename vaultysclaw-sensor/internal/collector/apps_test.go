package collector

import (
	"testing"

	"github.com/vaultys/vaultysclaw-sensor/internal/config"
)

func appRules() []config.AppRule { return config.DefaultSensorConfig().AIApplications }

func supportSubs() []string { return config.DefaultSupportProcessSubstrings() }

func TestDetectAIApplicationRealWorldShapes(t *testing.T) {
	cases := []struct {
		name     string
		proc     Process
		wantApp  string
		wantKind config.AppKind
	}{
		{
			name: "codex helper inside the ChatGPT bundle",
			proc: Process{
				Name:       "Codex (Service)",
				Executable: "/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/152.0/Helpers/Codex (Service).app/Contents/MacOS/Codex (Service)",
			},
			wantApp: "openai_codex", wantKind: config.AppKindHarness,
		},
		{
			name: "codex binary shipped by the VS Code extension",
			proc: Process{
				Name:       "codex",
				Executable: "/Users/x/.vscode/extensions/openai.chatgpt-26.825.51511-darwin-arm64/bin/macos-aarch64/codex",
			},
			wantApp: "openai_codex", wantKind: config.AppKindHarness,
		},
		{
			name: "chatgpt desktop itself is an assistant, not a harness",
			proc: Process{
				Name:       "ChatGPT",
				Executable: "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT",
			},
			wantApp: "openai_chatgpt_desktop", wantKind: config.AppKindAssistant,
		},
		{
			// Regression: Claude Desktop's own binary is called "claude" too.
			// A process-name rule on claude_code used to swallow it and report
			// every desktop chat window as a coding harness.
			name: "claude desktop is not claude code",
			proc: Process{
				Name:       "Claude",
				Executable: "/Applications/Claude.app/Contents/MacOS/Claude",
			},
			wantApp: "claude_desktop", wantKind: config.AppKindAssistant,
		},
		{
			name: "claude code bundled under Claude.app's support directory",
			proc: Process{
				Name:       "claude",
				Executable: "/Users/x/Library/Application Support/Claude/claude-code/2.1.260/claude.app/Contents/MacOS/claude",
			},
			wantApp: "claude_code", wantKind: config.AppKindHarness,
		},
		{
			name: "claude code as a global npm CLI",
			proc: Process{
				Name:       "node",
				Executable: "/opt/homebrew/bin/node",
				Command:    "node /opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js",
			},
			wantApp: "claude_code", wantKind: config.AppKindHarness,
		},
		{
			name: "kimi desktop",
			proc: Process{
				Name:       "Kimi",
				Executable: "/Applications/Kimi.app/Contents/MacOS/Kimi",
			},
			wantApp: "moonshot_kimi", wantKind: config.AppKindAssistant,
		},
		{
			name: "kimi electron helper, matched through the bundle path",
			proc: Process{
				Name:       "Kimi Helper (Renderer)",
				Executable: "/Applications/Kimi.app/Contents/Frameworks/Kimi Helper (Renderer).app/Contents/MacOS/Kimi Helper (Renderer)",
			},
			wantApp: "moonshot_kimi", wantKind: config.AppKindAssistant,
		},
		{
			name: "github copilot language server run headless by VS Code",
			proc: Process{
				Name:    "Code Helper",
				Command: "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper --node_modules/@github/copilot-darwin-arm64/index.js --headless",
			},
			wantApp: "github_copilot_cli", wantKind: config.AppKindHarness,
		},
		{
			name: "opencode desktop",
			proc: Process{
				Name:       "OpenCode Helper",
				Executable: "/Applications/OpenCode.app/Contents/Frameworks/OpenCode Helper.app/Contents/MacOS/OpenCode Helper",
			},
			wantApp: "opencode", wantKind: config.AppKindHarness,
		},
		{
			name: "vs code alone is an IDE, not AI usage",
			proc: Process{
				Name:       "Code Helper",
				Executable: "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper.app/Contents/MacOS/Code Helper",
			},
			wantApp: "vscode", wantKind: config.AppKindIDE,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := DetectAIApplication(tc.proc, nil, appRules(), supportSubs())
			if m == nil {
				t.Fatalf("expected %s, got no match", tc.wantApp)
			}
			if m.Name != tc.wantApp {
				t.Fatalf("expected %s, got %s (matched on %s)", tc.wantApp, m.Name, m.Reason)
			}
			if m.Kind != tc.wantKind {
				t.Fatalf("expected kind %s, got %s", tc.wantKind, m.Kind)
			}
			if m.ViaAncestor {
				t.Fatal("expected a direct match, not an ancestor one")
			}
		})
	}
}

func TestDetectAIApplicationIgnoresSupportProcesses(t *testing.T) {
	// Lives inside a matched bundle and matches its path rule, but is a crash
	// reporter — reporting it as an agent buries the process that is one.
	proc := Process{
		Name:       "browser_crashpad_handler",
		Executable: "/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/browser_crashpad_handler",
	}
	if m := DetectAIApplication(proc, nil, appRules(), supportSubs()); m != nil {
		t.Fatalf("expected crashpad handler to be ignored, got %s", m.Name)
	}
	updater := Process{
		Name:       "Updater",
		Executable: "/Users/x/Library/Caches/com.openai.codex/org.sparkle-project.Sparkle/Launcher/Updater.app/Contents/MacOS/Updater",
	}
	if m := DetectAIApplication(updater, nil, appRules(), supportSubs()); m != nil {
		t.Fatalf("expected sparkle updater to be ignored, got %s", m.Name)
	}
}

func TestDetectAIApplicationViaAncestor(t *testing.T) {
	child := Process{Name: "node", Executable: "/opt/homebrew/bin/node", Command: "node ./worker.js"}
	parent := Process{Name: "codex", Executable: "/Users/x/.codex/bin/codex"}

	if m := DetectAIApplication(child, nil, appRules(), supportSubs()); m != nil {
		t.Fatalf("child should not match on its own, got %s", m.Name)
	}
	m := DetectAIApplication(child, []Process{parent}, appRules(), supportSubs())
	if m == nil || m.Name != "openai_codex" {
		t.Fatalf("expected openai_codex via ancestor, got %+v", m)
	}
	if !m.ViaAncestor {
		t.Fatal("expected ViaAncestor to be set — the detector weights it lower")
	}
}

func TestDetectLocalRuntimeMatchesBundlePath(t *testing.T) {
	// A GUI-launched app's "command" is often just its bundle path, so a rule
	// written as a command-line fragment has to be checked against the
	// executable too.
	proc := Process{Name: "Ollama", Executable: "/Applications/Ollama.app/Contents/MacOS/Ollama"}
	m := DetectLocalRuntime(proc, nil, config.DefaultSensorConfig().LocalRuntimes)
	if m == nil || m.Name != "ollama" {
		t.Fatalf("expected ollama, got %+v", m)
	}
}
