package agent

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/vconn"

	"github.com/vaultys/vaultysclaw-hooks/internal/coverage"
)

// coverageEvery bounds how long the console's coverage view can go without a
// report from a connected host. Unchanged reports are re-sent this often so the
// console can tell "still enforcing" from "has not said anything for a day".
const coverageEvery = 10 * time.Minute

// CoverageReporter sends the host's coverage report when it changes, and at
// least every coverageEvery. A report counts as sent only once the connection
// acks the batch it went out in, so one lost to a dropped socket is re-sent.
type CoverageReporter struct {
	Compute func() coverage.Report
	// Now is injectable for tests.
	Now func() time.Time

	mu       sync.Mutex
	lastSent []byte
	sentAt   time.Time
}

// Next returns a hook_coverage envelope when one is due, and its ack.
func (r *CoverageReporter) Next() ([]vconn.Envelope, func()) {
	if r == nil || r.Compute == nil {
		return nil, nil
	}
	now := time.Now()
	if r.Now != nil {
		now = r.Now()
	}
	data, err := json.Marshal(r.Compute())
	if err != nil {
		return nil, nil
	}
	r.mu.Lock()
	due := string(data) != string(r.lastSent) || now.Sub(r.sentAt) >= coverageEvery
	r.mu.Unlock()
	if !due {
		return nil, nil
	}
	env := vconn.Envelope{MessageID: vconn.NewMessageID(), Type: vconn.MsgHookCoverage, Payload: data, Timestamp: now}
	return []vconn.Envelope{env}, func() {
		r.mu.Lock()
		r.lastSent, r.sentAt = data, now
		r.mu.Unlock()
	}
}
