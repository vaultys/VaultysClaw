// Package collector defines the platform-independent process/network model
// and collection interfaces. OS-specific implementations live under
// platform/{linux,darwin,windows} and are wired in via build-tagged factory
// files in this package (see factory_*.go) — nothing above this layer knows
// which OS it's running on.
package collector

import (
	"context"
	"time"
)

// Process is a metadata-only snapshot of a running process. No file
// contents, no environment variables beyond what the OS already exposes in
// its own process table.
type Process struct {
	PID, PPID  int
	Name       string
	Executable string
	Command    string
	User       string
	StartTime  time.Time
}

// ConnState is a coarse TCP connection state.
type ConnState string

const (
	ConnEstablished ConnState = "ESTABLISHED"
	ConnListen      ConnState = "LISTEN"
	ConnOther       ConnState = "OTHER"
)

// Connection is a single TCP socket owned by a process. For State ==
// ConnListen, LocalPort is the bound port and RemoteHost/RemotePort are
// empty/zero. For outbound connections, RemoteHost/RemotePort identify the
// destination and LocalPort is zero. This split (rather than the minimal
// PID/remoteHost/remotePort/state shape) is what lets a single collector
// feed both provider-destination matching and local-runtime port
// detection without a second interface.
type Connection struct {
	PID        int
	RemoteHost string
	RemotePort int
	LocalPort  int
	State      ConnState
}

// ProcessCollector enumerates currently running processes.
type ProcessCollector interface {
	Processes(ctx context.Context) ([]Process, error)
}

// NetworkCollector enumerates active TCP sockets (outbound + listening),
// associated with a PID whenever the OS makes that association available
// without elevated privileges. Never inspects payloads; never decrypts
// anything.
type NetworkCollector interface {
	Connections(ctx context.Context) ([]Connection, error)
}
