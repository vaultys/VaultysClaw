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
	Process        collector.Process
	Children       []collector.Process
	Connections    []collector.Connection // outbound only
	ListeningPorts []int
	Device         DeviceInfo
}

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
	for _, p := range processes {
		if p.PPID != 0 {
			childrenByPPID[p.PPID] = append(childrenByPPID[p.PPID], p)
		}
	}

	var out []Observation
	for _, p := range processes {
		conns := connsByPID[p.PID]
		listening := listeningByPID[p.PID]
		if !isCandidate(p, conns, listening, cfg) {
			continue
		}
		out = append(out, Observation{
			Process:        p,
			Children:       childrenByPPID[p.PID],
			Connections:    conns,
			ListeningPorts: listening,
			Device:         device,
		})
	}
	return out
}

func isCandidate(p collector.Process, conns []collector.Connection, listening []int, cfg *config.Sensor) bool {
	if len(conns) > 0 || len(listening) > 0 {
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
