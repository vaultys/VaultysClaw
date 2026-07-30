package collector

import (
	"testing"

	"github.com/vaultys/vaultysclaw-sensor/internal/config"
)

func TestIsBrowserProcess(t *testing.T) {
	names := []string{"Google Chrome", "firefox", "Safari"}
	if !IsBrowserProcess("Google Chrome", names) {
		t.Error("expected Google Chrome to match")
	}
	if !IsBrowserProcess("firefox", names) {
		t.Error("expected firefox to match")
	}
	if IsBrowserProcess("python3", names) {
		t.Error("did not expect python3 to match a browser")
	}
}

func TestDetectAgentFramework(t *testing.T) {
	rules := []config.AgentFrameworkRule{{Name: "langchain", CmdlineSubstrings: []string{"langchain"}}}

	m := DetectAgentFramework(Process{Command: "python3 run_langchain_bot.py"}, rules)
	if m == nil || m.Name != "langchain" {
		t.Fatalf("expected a langchain match, got %+v", m)
	}

	if DetectAgentFramework(Process{Command: "python3 unrelated.py"}, rules) != nil {
		t.Error("did not expect a match for an unrelated command line")
	}
}

func TestLooksLikeAgentNaming(t *testing.T) {
	if !LooksLikeAgentNaming(Process{Command: "python3 invoice-agent.py"}) {
		t.Error("expected 'invoice-agent.py' to look like agent naming")
	}
	if LooksLikeAgentNaming(Process{Command: "python3 report.py"}) {
		t.Error("did not expect 'report.py' to look like agent naming")
	}
}

func TestDetectLocalRuntime_MatchesByProcessName(t *testing.T) {
	rules := []config.RuntimeRule{{Name: "ollama", ProcessNames: []string{"ollama"}, Ports: []int{11434}}}

	m := DetectLocalRuntime(Process{Name: "ollama", Command: "ollama serve"}, nil, rules)
	if m == nil || m.Name != "ollama" || !m.MatchedByProcessName {
		t.Fatalf("expected a process-name match for ollama, got %+v", m)
	}
}

func TestDetectLocalRuntime_PortAloneIsWeakerMatch(t *testing.T) {
	rules := []config.RuntimeRule{{Name: "ollama", ProcessNames: []string{"ollama"}, Ports: []int{11434}}}

	m := DetectLocalRuntime(Process{Name: "some-other-binary"}, []int{11434}, rules)
	if m == nil || !m.MatchedByPortOnly {
		t.Fatalf("expected a port-only match, got %+v", m)
	}
	if m.MatchedByProcessName || m.MatchedByCmdline {
		t.Errorf("did not expect a name/cmdline match for an unrelated binary, got %+v", m)
	}
}

func TestDetectLocalRuntime_NoMatch(t *testing.T) {
	rules := []config.RuntimeRule{{Name: "ollama", ProcessNames: []string{"ollama"}, Ports: []int{11434}}}
	if DetectLocalRuntime(Process{Name: "bash"}, []int{22}, rules) != nil {
		t.Error("did not expect a match for bash on an unrelated port")
	}
}

func TestDetectMCP_MatchedChildIsDistinctFromMatchedSelf(t *testing.T) {
	rules := []config.MCPRule{{Name: "mcp_generic", CmdlineSubstrings: []string{"@modelcontextprotocol/"}}}

	parent := Process{Name: "node", Command: "node sales-agent.js"}
	children := []Process{{Name: "node", Command: "npx @modelcontextprotocol/server-salesforce"}}

	m := DetectMCP(parent, children, rules)
	if m == nil || !m.MatchedChild || m.MatchedSelf {
		t.Fatalf("expected a child match only, got %+v", m)
	}
	if len(m.Servers) != 1 || m.Servers[0] != "mcp_generic" {
		t.Errorf("expected servers to include mcp_generic, got %v", m.Servers)
	}
}

func TestDetectMCP_NoFalsePositiveForBareNodeOrNpx(t *testing.T) {
	rules := []config.MCPRule{{Name: "mcp_generic", CmdlineSubstrings: []string{"@modelcontextprotocol/"}}}

	// A plain node/npx process running something unrelated should never
	// match — "never assume every node or npx process is MCP".
	if DetectMCP(Process{Name: "node", Command: "node server.js"}, nil, rules) != nil {
		t.Error("did not expect a bare node process to match MCP rules")
	}
	if DetectMCP(Process{Name: "npx", Command: "npx create-react-app my-app"}, nil, rules) != nil {
		t.Error("did not expect an unrelated npx invocation to match MCP rules")
	}
}

func TestSplitHostPort(t *testing.T) {
	cases := []struct {
		in       string
		wantHost string
		wantPort int
	}{
		{"140.82.112.3:443", "140.82.112.3", 443},
		{"[::1]:8443", "::1", 8443},
		{"api.openai.com:443", "api.openai.com", 443},
		{"*:11434", "*", 11434},
	}
	for _, c := range cases {
		host, port := SplitHostPort(c.in)
		if host != c.wantHost || port != c.wantPort {
			t.Errorf("SplitHostPort(%q) = (%q, %d), want (%q, %d)", c.in, host, port, c.wantHost, c.wantPort)
		}
	}
}
