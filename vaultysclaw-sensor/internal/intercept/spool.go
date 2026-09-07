package intercept

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

// Spool defaults. Sized for a governance audit trail on a workstation: a
// generous in-memory queue so a brief control-plane outage costs nothing, and a
// file cap that bounds worst-case disk use rather than filling the host.
const (
	defaultQueueSize  = 4096
	defaultMaxBytes   = 16 << 20 // 16 MiB
	defaultFlushEvery = 2 * time.Second
)

// FileSpool is a durable, bounded Recorder: decisions are appended to a
// JSON-lines file and survive a crash.
//
// This replaces the earlier implementation's in-memory, uncapped,
// fire-and-forget batch (G7), which had both failure modes at once — a crash
// lost every decision taken since the last flush, and a slow control plane grew
// the batch without limit. Neither is acceptable for records taken on a security
// boundary.
//
// # Two bounds, and what happens at each
//
// The in-memory queue absorbs bursts; if it fills, Record does not block the
// request path — an audit backlog must never become a latency problem for the
// traffic being audited. The file has a size cap so a host that cannot reach the
// control plane for a long time does not fill its disk.
//
// Crossing either bound loses events, and the design's response is to make the
// loss impossible to miss rather than to pretend it cannot happen: the count is
// carried as SpoolGap on the next event actually written, so a reader of the
// trail sees the hole in place, and Stats reports the running total.
type FileSpool struct {
	path       string
	maxBytes   int64
	flushEvery time.Duration

	queue chan Event
	done  chan struct{}
	wg    sync.WaitGroup
	once  sync.Once

	dropped atomic.Int64 // total ever dropped, for Stats
	pending atomic.Int64 // dropped since the last successfully written event
	written atomic.Int64

	mu sync.Mutex // serialises file rotation against the writer
}

// SpoolOptions overrides the defaults. Zero fields keep the default.
type SpoolOptions struct {
	QueueSize  int
	MaxBytes   int64
	FlushEvery time.Duration
}

// SpoolStats is what an operator and the coverage metrics of §5.2.1 need.
type SpoolStats struct {
	// Written is the number of events durably appended.
	Written int64
	// Dropped is the number lost to a full queue or a full file. Any non-zero
	// value belongs in the control plane's health view: it is a measured gap in
	// the audit trail.
	Dropped int64
	// Queued is the current in-memory backlog.
	Queued int
}

// NewFileSpool opens (creating if needed) the spool at path and starts its
// writer. Call Close to flush and stop.
func NewFileSpool(path string, opts SpoolOptions) (*FileSpool, error) {
	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return nil, fmt.Errorf("intercept: creating spool directory: %w", err)
		}
	}

	s := &FileSpool{
		path:       path,
		maxBytes:   or(opts.MaxBytes, defaultMaxBytes),
		flushEvery: orDur(opts.FlushEvery, defaultFlushEvery),
		queue:      make(chan Event, orInt(opts.QueueSize, defaultQueueSize)),
		done:       make(chan struct{}),
	}

	// Fail at construction rather than silently dropping every event later.
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, fmt.Errorf("intercept: opening spool %s: %w", path, err)
	}
	_ = f.Close()

	s.wg.Add(1)
	go s.run()
	return s, nil
}

// Record queues an event. Never blocks: an audit backlog must not become a
// latency problem for the traffic being audited, so a full queue drops and
// counts instead of waiting.
func (s *FileSpool) Record(e Event) {
	select {
	case s.queue <- e:
	default:
		s.dropped.Add(1)
		s.pending.Add(1)
	}
}

// Stats reports the spool's counters.
func (s *FileSpool) Stats() SpoolStats {
	return SpoolStats{
		Written: s.written.Load(),
		Dropped: s.dropped.Load(),
		Queued:  len(s.queue),
	}
}

// Close flushes the queue and stops the writer. Safe to call more than once.
func (s *FileSpool) Close() error {
	s.once.Do(func() {
		close(s.done)
	})
	s.wg.Wait()
	return nil
}

func (s *FileSpool) run() {
	defer s.wg.Done()
	ticker := time.NewTicker(s.flushEvery)
	defer ticker.Stop()

	batch := make([]Event, 0, 64)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		s.append(batch)
		batch = batch[:0]
	}

	for {
		select {
		case e := <-s.queue:
			batch = append(batch, e)
			if len(batch) == cap(batch) {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-s.done:
			// Drain whatever is still queued before stopping, so a clean
			// shutdown loses nothing.
			for {
				select {
				case e := <-s.queue:
					batch = append(batch, e)
					if len(batch) == cap(batch) {
						flush()
					}
				default:
					flush()
					return
				}
			}
		}
	}
}

// append writes a batch, attaching any accumulated gap marker to the first
// event and enforcing the file cap.
func (s *FileSpool) append(batch []Event) {
	s.mu.Lock()
	defer s.mu.Unlock()

	f, err := os.OpenFile(s.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		s.dropped.Add(int64(len(batch)))
		s.pending.Add(int64(len(batch)))
		return
	}
	defer f.Close()

	size := int64(0)
	if info, err := f.Stat(); err == nil {
		size = info.Size()
	}

	w := bufio.NewWriter(f)
	for i, e := range batch {
		// The gap marker rides on the next event actually written, so the hole
		// appears in the trail at the point it happened.
		if i == 0 {
			if gap := s.pending.Swap(0); gap > 0 {
				e.SpoolGap = int(gap)
			}
		}

		line, err := json.Marshal(e)
		if err != nil {
			s.dropped.Add(1)
			s.pending.Add(1)
			continue
		}
		if size+int64(len(line))+1 > s.maxBytes {
			// The file is full. Drop the remainder rather than filling the
			// host's disk — and count it, so the gap is reported instead of
			// being inferred from a suspiciously short file.
			remaining := int64(len(batch) - i)
			s.dropped.Add(remaining)
			s.pending.Add(remaining)
			break
		}
		if _, err := w.Write(append(line, '\n')); err != nil {
			s.dropped.Add(1)
			s.pending.Add(1)
			continue
		}
		size += int64(len(line)) + 1
		s.written.Add(1)
	}

	if err := w.Flush(); err != nil {
		return
	}
	// fsync: the whole point of a durable spool is surviving a crash, and a
	// write that is only in the page cache does not.
	_ = f.Sync()
}

// ErrNothingToDrain means no spooled events are waiting.
var ErrNothingToDrain = errors.New("intercept: spool is empty")

// Drain hands every spooled event to ship and, if ship returns nil, discards
// them.
//
// Crash safety comes from rotation rather than a cursor: the live spool is
// renamed to a `.shipping` sidecar first, so a crash mid-ship leaves that file
// behind and the next Drain retries it. At-least-once delivery is the deliberate
// choice — a duplicated audit record is harmless, a lost one is not.
func (s *FileSpool) Drain(ship func([]Event) error) error {
	s.mu.Lock()
	staging := s.path + ".shipping"

	// A leftover sidecar from an interrupted ship takes priority; anything in
	// the live spool waits for the next call.
	if _, err := os.Stat(staging); err != nil {
		if !os.IsNotExist(err) {
			s.mu.Unlock()
			return fmt.Errorf("intercept: checking spool sidecar: %w", err)
		}
		info, err := os.Stat(s.path)
		if err != nil || info.Size() == 0 {
			s.mu.Unlock()
			return ErrNothingToDrain
		}
		if err := os.Rename(s.path, staging); err != nil {
			s.mu.Unlock()
			return fmt.Errorf("intercept: rotating spool: %w", err)
		}
	}
	s.mu.Unlock()

	events, err := readSpool(staging)
	if err != nil {
		return err
	}
	if len(events) == 0 {
		return os.Remove(staging)
	}
	if err := ship(events); err != nil {
		// Leave the sidecar in place for the next attempt.
		return err
	}
	return os.Remove(staging)
}

// ReadSpool parses a spool file without consuming it, for a reader that reports
// on the audit trail rather than shipping it — Drain is destructive and moves
// events into a sidecar, which is exactly wrong for a report an operator may run
// repeatedly over the same week of observation.
func ReadSpool(path string) ([]Event, error) { return readSpool(path) }

// readSpool parses a JSON-lines spool file. A truncated final line — the normal
// result of a crash mid-write — is skipped rather than failing the whole drain,
// which would strand every earlier record behind one bad byte.
func readSpool(path string) ([]Event, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("intercept: reading spool: %w", err)
	}
	defer f.Close()

	var events []Event
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64<<10), 1<<20)
	for sc.Scan() {
		var e Event
		if err := json.Unmarshal(sc.Bytes(), &e); err != nil {
			continue
		}
		events = append(events, e)
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("intercept: scanning spool: %w", err)
	}
	return events, nil
}

func or(v, def int64) int64 {
	if v <= 0 {
		return def
	}
	return v
}

func orInt(v, def int) int {
	if v <= 0 {
		return def
	}
	return v
}

func orDur(v, def time.Duration) time.Duration {
	if v <= 0 {
		return def
	}
	return v
}
