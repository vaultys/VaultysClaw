// Package supervise is the tool-call interception point: it governs a coding
// harness (Claude Code first) at the moment the harness is about to execute a
// tool, from a signed capability grant, with no control-plane round trip
// (docs/HARNESS_SUPERVISOR.md).
//
// This is tier A of that document's three tiers — the only one that sees
// *intent* (which tool, with which arguments), and the only one an agent can
// bypass, by rewriting the config that installs it or by shelling out. Tiers B
// (OS confinement) and C (the existing internal/intercept egress proxy) are what
// make a decision here binding; until tier B exists, supervision is advisory and
// every entry point in this package says so out loud.
package supervise

import (
	"encoding/json"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/toolgate"
)

// The decision core — tool mapping, the safety floor and Decide — lives in
// sdk-go/toolgate so vaultysclaw-hooks (docs/HARNESS_HOOKS.md) runs the very
// same logic. These aliases keep this package's callers, and its daemon,
// unchanged.

type (
	Action    = toolgate.Action
	Config    = toolgate.Config
	Floor     = toolgate.Floor
	FloorPath = toolgate.FloorPath
	Mode      = toolgate.Mode
	Outcome   = toolgate.Outcome
)

const (
	ModeObserve  = toolgate.ModeObserve
	ModeExplicit = toolgate.ModeExplicit

	CapFileRead        = toolgate.CapFileRead
	CapFileWrite       = toolgate.CapFileWrite
	CapCodeExecution   = toolgate.CapCodeExecution
	CapInternetAccess  = toolgate.CapInternetAccess
	CapKnowledgeSearch = toolgate.CapKnowledgeSearch
	CapAPICall         = toolgate.CapAPICall
	CapAgentComm       = toolgate.CapAgentComm
)

var (
	ErrUnmapped       = toolgate.ErrUnmapped
	ErrNoResource     = toolgate.ErrNoResource
	DefaultFloorPaths = toolgate.DefaultFloorPaths
)

func Decide(cfg Config, action Action, mapErr error, now time.Time) Outcome {
	return toolgate.Decide(cfg, action, mapErr, now)
}

func MapToolCall(tool string, input json.RawMessage, cwd string) (Action, error) {
	return toolgate.MapToolCall(tool, input, cwd)
}

func NewFloor(paths []string, extra ...FloorPath) *Floor { return toolgate.NewFloor(paths, extra...) }
func ResolvePath(path, cwd string) (string, error)       { return toolgate.ResolvePath(path, cwd) }
func FileURI(absPath string) string                      { return toolgate.FileURI(absPath) }
func Argv0(command string) string                        { return toolgate.Argv0(command) }
