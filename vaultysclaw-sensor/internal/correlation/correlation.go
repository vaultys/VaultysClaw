// Package correlation joins raw process/network collection results into
// per-process Observations, cheaply filtered to processes worth
// classifying at all — keeping the detector from having to look at every
// process on the machine every 30 seconds.
package correlation

import (
	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/config"
)

// DeviceInfo identifies the machine an Observation was collected on.
type DeviceInfo struct {
	ID       string
	Hostname string
	OS       string
}

// Observation is everything the detector needs about one process to
// classify it: the process itself, its immediate children (for MCP
// child-spawn detection), its outbound connections, and the ports it's
// listening on (for local-runtime detection). "Long-running" and
// "repeated connectivity" signals are derived directly from
// Process.StartTime and len(Connections) by the detector — deliberately no
// separate history/duration field here, so a single poll cycle's
// Observation is fully self-contained (state/dedup happens strictly after
// detection in the pipeline, never feeds back into it).
type Observation struct {
	Process  collector.Process
	Children []collector.Process
	// Ancestors are this process's parents, nearest first and depth-bounded.
	// They exist so a nondescript child — the `node` or `python` a harness
	// shells out to, an Electron helper that does all of the app's actual
	// network I/O — can be attributed back to the application that spawned it
	// instead of being classified as an anonymous process talking to an API.
	Ancestors      []collector.Process
	Connections    []collector.Connection // outbound only
	ListeningPorts []int
	Device         DeviceInfo
}

// maxAncestorDepth bounds the parent walk. Four levels reaches an Electron
// helper's app bundle and a shell-wrapped CLI's real parent without turning
// every process on the machine into a descendant of whatever launched the
// session.
const maxAncestorDepth = 4

// Build groups connections by PID, groups processes by parent PID, and
// returns one Observation per process that shows at least one signal worth
// classifying: a network connection (outbound or listening), or a command
// line matching a configured agent-framework/naming pattern. This is the
// "candidate" prefilter — cheap substring/map lookups only, never a
// filesystem scan.
func Build(device DeviceInfo, processes []collector.Process, connections []collector.Connection, cfg *config.Sensor) []Observation {
	connsByPID := make(map[int][]collector.Connection)
	listeningByPID := make(map[int][]int)
	for _, c := range connections {
		if c.State == collector.ConnListen {
			listeningByPID[c.PID] = append(listeningByPID[c.PID], c.LocalPort)
		} else {
			connsByPID[c.PID] = append(connsByPID[c.PID], c)
		}
	}

	childrenByPPID := make(map[int][]collector.Process)
	byPID := make(map[int]collector.Process, len(processes))
	for _, p := range processes {
		byPID[p.PID] = p
		if p.PPID != 0 {
			childrenByPPID[p.PPID] = append(childrenByPPID[p.PPID], p)
		}
	}

	var out []Observation
	for _, p := range processes {
		conns := connsByPID[p.PID]
		listening := listeningByPID[p.PID]
		ancestors := ancestorsOf(p, byPID)
		if !isCandidate(p, ancestors, conns, listening, cfg) {
			continue
		}
		out = append(out, Observation{
			Process:        p,
			Children:       childrenByPPID[p.PID],
			Ancestors:      ancestors,
			Connections:    conns,
			ListeningPorts: listening,
			Device:         device,
		})
	}
	return out
}

// ancestorsOf walks the PPID chain, nearest parent first, stopping at
// maxAncestorDepth, at pid 0/1, or on a cycle (PID reuse can make the table
// the OS handed us inconsistent — a loop here would hang the poll).
func ancestorsOf(p collector.Process, byPID map[int]collector.Process) []collector.Process {
	var out []collector.Process
	seen := map[int]struct{}{p.PID: {}}
	cur := p
	for depth := 0; depth < maxAncestorDepth; depth++ {
		if cur.PPID <= 1 {
			return out
		}
		parent, ok := byPID[cur.PPID]
		if !ok {
			return out
		}
		if _, dup := seen[parent.PID]; dup {
			return out
		}
		seen[parent.PID] = struct{}{}
		out = append(out, parent)
		cur = parent
	}
	return out
}

func isCandidate(p collector.Process, ancestors []collector.Process, conns []collector.Connection, listening []int, cfg *config.Sensor) bool {
	if len(conns) > 0 || len(listening) > 0 {
		return true
	}
	// An installed AI application is worth classifying even when this poll
	// caught it with no open socket — a desktop assistant sitting idle between
	// turns, or a harness waiting on the user, is still a running AI workload.
	//
	// Ancestors are deliberately not consulted here: with no connection of its
	// own, a descendant of a harness is just a command the harness ran (`ps`,
	// `zsh`, `go build`), and treating each one as an AI workload would bury
	// the harness itself under its own tool calls.
	if collector.DetectAIApplication(p, nil, cfg.AIApplications, cfg.SupportProcess) != nil {
		return true
	}
	if collector.DetectAgentFramework(p, cfg.AgentFrameworks) != nil {
		return true
	}
	if collector.LooksLikeAgentNaming(p) {
		return true
	}
	return false
}
