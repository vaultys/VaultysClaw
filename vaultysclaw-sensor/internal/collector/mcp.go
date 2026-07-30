package collector

import (
	"strings"

	"github.com/vaultys/vaultysclaw-sensor/internal/config"
)

// MCPMatch is a positive match against configured MCP server patterns,
// either on the process itself or on one of its children. A matched child
// process is much stronger agent evidence than the process matching its
// own command line — a bare `npx @modelcontextprotocol/server-filesystem`
// could just be someone poking at MCP manually, but a long-running parent
// that *spawns* one is a strong sign it's operating as an agent.
type MCPMatch struct {
	MatchedSelf  bool
	MatchedChild bool
	Servers      []string
}

// DetectMCP checks a process and its known children against configured MCP
// rules. children should be the immediate child processes (by PPID) of
// proc, as built by internal/correlation. Never reads MCP config file
// contents beyond checking a well-known path's existence/name, and never
// assumes every node/npx process is MCP — only cmdline substring matches
// against the configured catalog count.
func DetectMCP(proc Process, children []Process, rules []config.MCPRule) *MCPMatch {
	servers := make([]string, 0, 2)
	matchedSelf := false
	matchedChild := false

	selfCmd := strings.ToLower(proc.Command)
	for _, rule := range rules {
		for _, sub := range rule.CmdlineSubstrings {
			if sub == "" || selfCmd == "" {
				continue
			}
			if strings.Contains(selfCmd, strings.ToLower(sub)) {
				matchedSelf = true
				servers = appendUnique(servers, rule.Name)
			}
		}
	}

	for _, child := range children {
		childCmd := strings.ToLower(child.Command)
		if childCmd == "" {
			continue
		}
		for _, rule := range rules {
			for _, sub := range rule.CmdlineSubstrings {
				if sub == "" {
					continue
				}
				if strings.Contains(childCmd, strings.ToLower(sub)) {
					matchedChild = true
					servers = appendUnique(servers, rule.Name)
				}
			}
		}
	}

	if !matchedSelf && !matchedChild {
		return nil
	}
	return &MCPMatch{MatchedSelf: matchedSelf, MatchedChild: matchedChild, Servers: servers}
}

func appendUnique(list []string, v string) []string {
	for _, existing := range list {
		if existing == v {
			return list
		}
	}
	return append(list, v)
}
