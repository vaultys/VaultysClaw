// Package audit appends one JSON line per hook invocation to a local spool.
//
// Phase 0 keeps the spool on the host; phase 1's agent ships it to the control
// plane. What is recorded is chosen for that destination: the decision and the
// resource it was about, never the tool's arguments, a prompt, or a file's
// contents.
package audit

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// Record is one line of the spool.
type Record struct {
	// ID makes a record idempotent on the control plane: the agent delivers at
	// least once, and a batch re-sent after a dropped connection must not
	// count twice.
	ID         string    `json:"id"`
	Time       time.Time `json:"time"`
	Vendor     string    `json:"vendor"`
	Event      string    `json:"event"`
	Kind       string    `json:"kind"`
	Mode       string    `json:"mode"`
	Session    string    `json:"session,omitempty"`
	Cwd        string    `json:"cwd,omitempty"`
	Tool       string    `json:"tool,omitempty"`
	VendorTool string    `json:"vendorTool,omitempty"`
	Capability string    `json:"capability,omitempty"`
	Resource   string    `json:"resource,omitempty"`

	// Decision fields, set on pre_tool events only.
	Decided      bool   `json:"decided,omitempty"`
	Blocked      bool   `json:"blocked,omitempty"`
	WouldDeny    bool   `json:"wouldDeny,omitempty"`
	Unmapped     bool   `json:"unmapped,omitempty"`
	NoResource   bool   `json:"noResource,omitempty"`
	FloorRefused bool   `json:"floorRefused,omitempty"`
	RuleID       string `json:"ruleId,omitempty"`
	CertID       string `json:"certId,omitempty"`
	Reason       string `json:"reason,omitempty"`

	// Error is set when the invocation could not be evaluated normally.
	Error string `json:"error,omitempty"`
}

// maxSpoolBytes caps the spool until something drains it. Past the cap new
// records are dropped rather than filling the disk of a host nobody drains.
const maxSpoolBytes = 64 << 20

// Append writes rec as one line. A failure is returned but must never change a
// decision: the audit trail is a record of the gate, not part of it.
func Append(path string, rec Record) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	if info, err := os.Stat(path); err == nil && info.Size() > maxSpoolBytes {
		return errSpoolFull
	}
	if rec.ID == "" {
		rec.ID = newID()
	}
	line, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	// One write call per record: with O_APPEND, concurrent hook processes
	// (parallel tool calls) cannot interleave inside a line.
	_, werr := f.Write(append(line, '\n'))
	cerr := f.Close()
	if werr != nil {
		return werr
	}
	return cerr
}

type spoolFullError struct{}

func (spoolFullError) Error() string { return "audit: spool is full; record dropped" }

var errSpoolFull error = spoolFullError{}

func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
