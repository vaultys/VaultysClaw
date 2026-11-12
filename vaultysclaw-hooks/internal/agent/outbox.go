package agent

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/vconn"
)

// sendingMarker separates a spool file's name from the time it was claimed.
const sendingMarker = ".sending-"

// Outbox drains audit spools into hook_audit messages.
//
// Hooks append to live spool files from many short-lived processes; the agent
// never reads a file something may still be writing. Each round it:
//
//  1. offers the oldest *claimed* file whose claim is older than Grace — every
//     hook that opened it before the claim has long finished its single write;
//  2. otherwise claims every non-empty live spool by renaming it aside, and
//     offers nothing this round. A hook arriving after the rename creates a
//     fresh live file.
//
// A claimed file is deleted only by the ack, after every message from it was
// written to the socket. A drop before that leaves it to be offered again:
// delivery is at-least-once, and records carry ids for the receiver to dedupe.
type Outbox struct {
	Dir      string
	MaxBatch int
	Grace    time.Duration
	Logger   *slog.Logger
	Now      func() time.Time
}

func (o *Outbox) now() time.Time {
	if o.Now != nil {
		return o.Now()
	}
	return time.Now()
}

// Next implements vconn.ClientConfig.Outbox.
func (o *Outbox) Next() ([]vconn.Envelope, func()) {
	entries, err := os.ReadDir(o.Dir)
	if err != nil {
		return nil, nil
	}
	type claimed struct {
		path string
		at   time.Time
	}
	var claims []claimed
	var live []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if i := strings.LastIndex(name, sendingMarker); i >= 0 {
			nanos, err := strconv.ParseInt(name[i+len(sendingMarker):], 10, 64)
			if err == nil {
				claims = append(claims, claimed{filepath.Join(o.Dir, name), time.Unix(0, nanos)})
			}
			continue
		}
		if strings.HasSuffix(name, ".jsonl") {
			live = append(live, filepath.Join(o.Dir, name))
		}
	}

	sort.Slice(claims, func(i, j int) bool { return claims[i].at.Before(claims[j].at) })
	now := o.now()
	for _, c := range claims {
		if now.Sub(c.at) < o.Grace {
			continue
		}
		msgs, err := o.envelopes(c.path)
		if err != nil {
			o.log().Warn("agent: audit spool unreadable; leaving it for the next round", "file", c.path, "err", err)
			continue
		}
		path := c.path
		return msgs, func() {
			if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
				o.log().Warn("agent: could not remove a delivered audit spool; it will be re-sent", "file", path, "err", err)
			}
		}
	}

	stamp := strconv.FormatInt(now.UnixNano(), 10)
	for _, path := range live {
		if info, err := os.Stat(path); err != nil || info.Size() == 0 {
			continue
		}
		if err := os.Rename(path, path+sendingMarker+stamp); err != nil {
			o.log().Warn("agent: could not claim an audit spool", "file", path, "err", err)
		}
	}
	return nil, nil
}

// envelopes reads one claimed file into batches. Lines that are not JSON are
// skipped and counted: one torn line must not hold back the rest of the trail.
func (o *Outbox) envelopes(path string) ([]vconn.Envelope, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	max := o.MaxBatch
	if max <= 0 {
		max = 200
	}
	var (
		out     []vconn.Envelope
		batch   []json.RawMessage
		skipped int
	)
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		env, err := vconn.NewEnvelope(vconn.MsgHookAudit, vconn.HookAuditPayload{Events: batch})
		if err != nil {
			return err
		}
		out = append(out, env)
		batch = nil
		return nil
	}
	sc := bufio.NewScanner(bytes.NewReader(data))
	sc.Buffer(make([]byte, 0, 64<<10), 1<<20)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 {
			continue
		}
		if !json.Valid(line) {
			skipped++
			continue
		}
		batch = append(batch, json.RawMessage(append([]byte(nil), line...)))
		if len(batch) >= max {
			if err := flush(); err != nil {
				return nil, err
			}
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("reading %s: %w", path, err)
	}
	if err := flush(); err != nil {
		return nil, err
	}
	if skipped > 0 {
		o.log().Warn("agent: skipped malformed audit lines", "file", path, "skipped", skipped)
	}
	return out, nil
}

func (o *Outbox) log() *slog.Logger {
	if o.Logger != nil {
		return o.Logger
	}
	return slog.Default()
}
