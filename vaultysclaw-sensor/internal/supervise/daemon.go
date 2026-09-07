package supervise

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/intercept"
)

// Request is one tool call submitted for a decision, as the hook shim sends it
// over the unix socket. Deliberately the harness-neutral subset: a Codex or
// OpenClaw shim produces the same three fields, so the daemon never learns
// which harness it is governing.
type Request struct {
	Tool  string          `json:"tool"`
	Input json.RawMessage `json:"input"`
	Cwd   string          `json:"cwd"`
	// Session is the harness's own session identifier, carried only into the
	// audit record.
	Session string `json:"session,omitempty"`
	// Probe marks a liveness check rather than a real tool call — Preflight
	// uses one to confirm the socket answers before the harness starts.
	//
	// It is answered normally but **never recorded**. A synthetic call the
	// supervisor makes about itself would otherwise land in the spool as an
	// ungoverned pass, inflating the coverage metric §5.2.1 requires be
	// countable with events no agent ever made. A metric polluted by the tool
	// that reports it is worse than no metric.
	Probe bool `json:"probe,omitempty"`
}

// Response is the decision. The hook shim translates it into whatever shape its
// harness expects; nothing harness-specific belongs here.
type Response struct {
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason,omitempty"`
	// Mode is echoed back so a shim can say "advisory" in the reason it shows a
	// human without having to be configured separately.
	Mode Mode `json:"mode"`
}

// Daemon serves decisions on a unix socket, one per line of JSON.
//
// A resident daemon rather than a decision computed inside the hook process,
// because this sits in the critical path of *every* tool call: re-reading and
// re-verifying signed artefacts per call would put certificate verification
// between an agent and each of its actions. The shim is therefore as small as
// possible, and everything expensive happens once, here.
type Daemon struct {
	// ConfigFor supplies the current decision inputs. A function rather than a
	// value so a reload takes effect on the next call without restarting the
	// listener or locking anything here — same contract as intercept.Proxy.
	ConfigFor func() Config
	Recorder  intercept.Recorder
	Logger    *slog.Logger

	listener net.Listener
	path     string
	wg       sync.WaitGroup
	closing  chan struct{}
	once     sync.Once
}

// Listen binds the daemon to a unix socket at path.
//
// The socket is created 0600 and in a 0700 directory: it is an authorization
// oracle that answers as this host's granted identity, and anything that can
// write to it can ask for a decision. Restricting it to the owner is the only
// access control there is — there is no authentication on this socket, by
// design, because the processes it serves are the ones this daemon launched.
func (d *Daemon) Listen(path string) error {
	if err := checkSocketPathLength(path); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("supervise: preparing the socket directory: %w", err)
	}
	// A socket left behind by a crash would otherwise make every start fail.
	// Safe to remove because binding is exclusive: if another daemon is live on
	// this path, the Listen below is what fails, not this.
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("supervise: clearing a stale socket at %s: %w", path, err)
	}
	ln, err := net.Listen("unix", path)
	if err != nil {
		return fmt.Errorf("supervise: listening on %s: %w", path, err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		ln.Close()
		return fmt.Errorf("supervise: restricting %s: %w", path, err)
	}
	d.listener = ln
	d.path = path
	d.closing = make(chan struct{})
	return nil
}

// Path returns the bound socket path.
func (d *Daemon) Path() string { return d.path }

// Serve accepts connections until Close. It returns nil on a clean shutdown.
func (d *Daemon) Serve() error {
	for {
		conn, err := d.listener.Accept()
		if err != nil {
			select {
			case <-d.closing:
				return nil
			default:
			}
			// A single failed accept is not a reason to stop deciding for every
			// other caller.
			var ne net.Error
			if errors.As(err, &ne) && ne.Timeout() {
				continue
			}
			return fmt.Errorf("supervise: accept: %w", err)
		}
		d.wg.Add(1)
		go func() {
			defer d.wg.Done()
			d.handle(conn)
		}()
	}
}

// Close stops accepting, waits for in-flight decisions, and removes the socket.
func (d *Daemon) Close() error {
	d.once.Do(func() {
		close(d.closing)
		if d.listener != nil {
			d.listener.Close()
		}
	})
	d.wg.Wait()
	if d.path != "" {
		os.Remove(d.path)
	}
	return nil
}

// handle serves one connection, which may carry several calls — a harness that
// keeps the connection open gets a decision per line.
func (d *Daemon) handle(conn net.Conn) {
	defer conn.Close()
	scanner := bufio.NewScanner(conn)
	// Tool input can be large (a Write's whole file body), so the default 64 KiB
	// line limit is not enough. A call bigger than this is refused rather than
	// silently truncated into a decision about the wrong arguments.
	scanner.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	enc := json.NewEncoder(conn)

	for scanner.Scan() {
		var req Request
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			// Fail closed: a request that cannot be parsed has not been judged,
			// and permitting it would make malformed input the way past the gate.
			_ = enc.Encode(Response{Allowed: false, Reason: "refused: malformed decision request"})
			return
		}
		_ = enc.Encode(d.Decide(req))
	}
	if err := scanner.Err(); err != nil && d.Logger != nil {
		d.Logger.Debug("supervise: connection ended", "err", err)
	}
}

// Decide runs one request through the mapper, the decider, and the recorder.
// Exported so a test — or a future in-process harness — can exercise the whole
// path without a socket.
func (d *Daemon) Decide(req Request) Response {
	cfg := d.ConfigFor()
	now := time.Now()

	action, mapErr := MapToolCall(req.Tool, req.Input, req.Cwd)
	out := Decide(cfg, action, mapErr, now)

	if d.Recorder != nil && !req.Probe {
		d.Recorder.Record(intercept.Event{
			At:         now,
			Resource:   action.Resource,
			Tool:       req.Tool,
			Capability: string(action.Capability),
			Allowed:    out.Allowed,
			Reason:     out.Reason,
			CertID:     out.GrantingCertID,
			// The floor is this role's deny source until phase 3 gives it a
			// signed one, so it goes in the slot intercept already uses for a
			// deny that settled a call without consulting the certificate. When
			// the floor is retired into a signed rule set, this becomes a real
			// rule id and nothing reading the spool has to change.
			RuleID:     ruleID(out),
			WouldDeny:  out.WouldDeny,
			Ungoverned: out.Unmapped,
			NoResource: out.NoResource,
			ClientAddr: req.Session,
		})
	}

	return Response{Allowed: out.Allowed, Reason: out.Reason, Mode: cfg.Mode}
}

// FloorRuleID marks an event refused by the local safety floor rather than by a
// certificate. A reader must be able to tell the two apart without matching on
// reason text, which is prose and will be reworded.
const FloorRuleID = "floor"

// ruleID reports what settled the call, for the audit record: a signed rule when
// one did, and otherwise the floor marker when the floor refused. Order matters
// — a signed rule that overrode the floor must be recorded as the rule, or the
// trail would credit unsigned local config with an admin's decision.
func ruleID(out Outcome) string {
	if out.RuleID != "" {
		return out.RuleID
	}
	if out.FloorRefused {
		return FloorRuleID
	}
	return ""
}

// maxSocketPath is a conservative bound on a unix socket path.
//
// The real limit is the platform's sockaddr_un.sun_path: 104 bytes on macOS,
// 108 on Linux, both including the terminating NUL. Exceeding it fails at bind
// with "invalid argument", which tells an operator nothing at all — this check
// exists to turn that into a sentence naming the actual problem.
const maxSocketPath = 100

func checkSocketPathLength(path string) error {
	if len(path) <= maxSocketPath {
		return nil
	}
	return fmt.Errorf(
		"supervise: the socket path is %d bytes, over the %d-byte limit a unix socket allows — "+
			"set supervise.socketPath to something shorter (the directory is what matters, not the file name): %s",
		len(path), maxSocketPath, path)
}
