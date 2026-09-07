package collector

import (
	"strings"

	"github.com/vaultys/vaultysclaw-sensor/internal/config"
)

// AIApplicationMatch is a positive match of a process against a configured
// AI application rule (a desktop app, a CLI harness, or an AI-capable IDE).
type AIApplicationMatch struct {
	Name string
	Kind config.AppKind
	// Reason names which attribute matched, so the detector's explanation can
	// say *why* — "executable path" and "command line" are very different
	// levels of evidence to a human reading an audit trail.
	Reason string
	// ViaAncestor is set when the match came from a parent/grandparent process
	// rather than this one. Electron apps do all their network I/O from helper
	// processes whose executables do live under the bundle, but a harness that
	// shells out to `node` or `python` leaves a child that looks like nothing
	// at all until it is attributed back to its parent.
	ViaAncestor bool
}

// DetectAIApplication matches a process against the configured application
// catalog, returning the first rule that matches — the catalog is ordered
// most-specific-first precisely so this is well-defined (Claude Code lives
// inside Claude.app's tree; Codex lives inside ChatGPT.app's).
//
// ancestors are the process's parents, nearest first, and may be nil. A match
// found only through an ancestor is flagged rather than silently presented as
// a direct one, because the detector weights it lower.
func DetectAIApplication(proc Process, ancestors []Process, rules []config.AppRule, supportSubstrings []string) *AIApplicationMatch {
	if IsSupportProcess(proc, supportSubstrings) {
		return nil
	}
	if m := matchApp(proc, rules); m != nil {
		return m
	}
	for _, anc := range ancestors {
		if IsSupportProcess(anc, supportSubstrings) {
			continue
		}
		if m := matchApp(anc, rules); m != nil {
			m.ViaAncestor = true
			return m
		}
	}
	return nil
}

func matchApp(proc Process, rules []config.AppRule) *AIApplicationMatch {
	name := strings.ToLower(proc.Name)
	exe := strings.ToLower(proc.Executable)
	cmd := strings.ToLower(proc.Command)

	for _, rule := range rules {
		for _, pn := range rule.ProcessNames {
			if pn != "" && name == strings.ToLower(pn) {
				return &AIApplicationMatch{Name: rule.Name, Kind: rule.Kind, Reason: "process name"}
			}
		}
		for _, sub := range rule.ExecutableSubstrings {
			if sub == "" || exe == "" {
				continue
			}
			if strings.Contains(exe, strings.ToLower(sub)) {
				return &AIApplicationMatch{Name: rule.Name, Kind: rule.Kind, Reason: "executable path"}
			}
		}
		for _, sub := range rule.CmdlineSubstrings {
			if sub == "" || cmd == "" {
				continue
			}
			if strings.Contains(cmd, strings.ToLower(sub)) {
				return &AIApplicationMatch{Name: rule.Name, Kind: rule.Kind, Reason: "command line"}
			}
		}
	}
	return nil
}

// IsSupportProcess reports whether a process is an application's crash
// reporter, updater or similar accessory rather than the application itself.
// Matched as a substring of both the basename and the full executable path,
// since these are named inconsistently across platforms
// ("chrome_crashpad_handler", "Autoupdate", "Updater.app").
func IsSupportProcess(proc Process, substrings []string) bool {
	hay := strings.ToLower(proc.Name + "\x00" + proc.Executable)
	for _, sub := range substrings {
		if sub != "" && strings.Contains(hay, strings.ToLower(sub)) {
			return true
		}
	}
	return false
}
