package intercept

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func newSpool(t *testing.T, opts SpoolOptions) (*FileSpool, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "nested", "audit.jsonl")
	if opts.FlushEvery == 0 {
		opts.FlushEvery = 10 * time.Millisecond
	}
	s, err := NewFileSpool(path, opts)
	if err != nil {
		t.Fatalf("NewFileSpool: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s, path
}

func TestSpoolPersistsEventsAcrossClose(t *testing.T) {
	s, path := newSpool(t, SpoolOptions{})

	for i := 0; i < 5; i++ {
		s.Record(Event{At: time.Now(), Destination: fmt.Sprintf("h%d:443", i), Allowed: i%2 == 0, Reason: "test"})
	}
	if err := s.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	events, err := readSpool(path)
	if err != nil {
		t.Fatalf("readSpool: %v", err)
	}
	if len(events) != 5 {
		t.Fatalf("read %d events, want 5 — a clean shutdown must lose nothing", len(events))
	}
	if events[0].Destination != "h0:443" || events[4].Destination != "h4:443" {
		t.Errorf("events out of order or corrupted: %+v", events)
	}
	if s.Stats().Written != 5 {
		t.Errorf("Written = %d, want 5", s.Stats().Written)
	}
}

func TestSpoolDoesNotBlockWhenTheQueueIsFull(t *testing.T) {
	// An audit backlog must never become a latency problem for the traffic being
	// audited. A tiny queue and a slow flush guarantee overflow here.
	s, _ := newSpool(t, SpoolOptions{QueueSize: 1, FlushEvery: time.Hour})

	done := make(chan struct{})
	go func() {
		for i := 0; i < 500; i++ {
			s.Record(Event{Destination: "h:443"})
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Record blocked on a full queue")
	}

	if s.Stats().Dropped == 0 {
		t.Fatal("Dropped = 0 — overflow was expected and must be counted")
	}
}

func TestDroppedEventsSurfaceAsAGapMarkerInTheStream(t *testing.T) {
	// §5.2.1's requirement: the hole must be visible to whoever reads the trail,
	// not only in a counter nobody looks at.
	s, path := newSpool(t, SpoolOptions{QueueSize: 1, FlushEvery: time.Hour})

	// Overflow the queue while the writer is idle.
	for i := 0; i < 200; i++ {
		s.Record(Event{Destination: "flood:443"})
	}
	dropped := s.Stats().Dropped
	if dropped == 0 {
		t.Fatal("expected drops")
	}

	if err := s.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	events, err := readSpool(path)
	if err != nil {
		t.Fatalf("readSpool: %v", err)
	}
	if len(events) == 0 {
		t.Fatal("no events were written at all")
	}

	var gap int
	for _, e := range events {
		gap += e.SpoolGap
	}
	if gap == 0 {
		t.Fatal("no SpoolGap marker in the stream — the drop is invisible to a reader of the trail")
	}
	if int64(gap) > dropped {
		t.Errorf("SpoolGap total %d exceeds Dropped %d", gap, dropped)
	}
}

func TestSpoolRespectsTheFileCap(t *testing.T) {
	// A host that cannot reach the control plane for a long time must not fill
	// its disk.
	s, path := newSpool(t, SpoolOptions{MaxBytes: 2048, FlushEvery: 5 * time.Millisecond})

	for i := 0; i < 500; i++ {
		s.Record(Event{At: time.Now(), Destination: fmt.Sprintf("host-%d.example:443", i), Reason: "some reason text"})
		if i%50 == 0 {
			time.Sleep(10 * time.Millisecond)
		}
	}
	if err := s.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if info.Size() > 2048 {
		t.Errorf("spool grew to %d bytes, past the 2048 cap", info.Size())
	}
	if s.Stats().Dropped == 0 {
		t.Error("hitting the file cap dropped nothing — the cap was not exercised")
	}
}

func TestDrainShipsAndClears(t *testing.T) {
	s, path := newSpool(t, SpoolOptions{})
	for i := 0; i < 3; i++ {
		s.Record(Event{Destination: fmt.Sprintf("h%d:443", i)})
	}
	if err := s.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	var shipped []Event
	if err := s.Drain(func(batch []Event) error {
		shipped = append(shipped, batch...)
		return nil
	}); err != nil {
		t.Fatalf("Drain: %v", err)
	}
	if len(shipped) != 3 {
		t.Fatalf("shipped %d events, want 3", len(shipped))
	}

	// The live spool and the sidecar are both gone on success.
	if _, err := os.Stat(path + ".shipping"); !os.IsNotExist(err) {
		t.Error("the sidecar survived a successful ship")
	}
	if err := s.Drain(func([]Event) error { return nil }); !errors.Is(err, ErrNothingToDrain) {
		t.Errorf("second Drain: err = %v, want ErrNothingToDrain", err)
	}
}

func TestDrainRetriesAfterAFailedShip(t *testing.T) {
	// At-least-once is the deliberate choice: a duplicated audit record is
	// harmless, a lost one is not.
	s, _ := newSpool(t, SpoolOptions{})
	s.Record(Event{Destination: "h:443"})
	if err := s.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	shipErr := errors.New("control plane unreachable")
	if err := s.Drain(func([]Event) error { return shipErr }); !errors.Is(err, shipErr) {
		t.Fatalf("Drain: err = %v, want the ship error", err)
	}

	// The events must still be there for the next attempt.
	var retried []Event
	if err := s.Drain(func(batch []Event) error {
		retried = append(retried, batch...)
		return nil
	}); err != nil {
		t.Fatalf("retry Drain: %v", err)
	}
	if len(retried) != 1 {
		t.Fatalf("retry shipped %d events, want 1 — a failed ship lost the record", len(retried))
	}
}

func TestDrainRecoversALeftoverSidecarFromACrash(t *testing.T) {
	s, path := newSpool(t, SpoolOptions{})
	if err := s.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	// Simulate a crash mid-ship: a sidecar exists with unshipped records.
	line, _ := json.Marshal(Event{Destination: "crashed:443", Allowed: true})
	if err := os.WriteFile(path+".shipping", append(line, '\n'), 0o600); err != nil {
		t.Fatalf("writing sidecar: %v", err)
	}

	var shipped []Event
	if err := s.Drain(func(batch []Event) error {
		shipped = append(shipped, batch...)
		return nil
	}); err != nil {
		t.Fatalf("Drain: %v", err)
	}
	if len(shipped) != 1 || shipped[0].Destination != "crashed:443" {
		t.Fatalf("shipped = %+v, want the record left behind by the crash", shipped)
	}
}

func TestReadSpoolSkipsATruncatedFinalLine(t *testing.T) {
	// The normal result of a crash mid-write. One bad byte must not strand every
	// earlier record.
	path := filepath.Join(t.TempDir(), "audit.jsonl")
	good, _ := json.Marshal(Event{Destination: "good:443"})
	content := append(append(good, '\n'), []byte(`{"destination":"trunc`)...)
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}

	events, err := readSpool(path)
	if err != nil {
		t.Fatalf("readSpool: %v", err)
	}
	if len(events) != 1 || events[0].Destination != "good:443" {
		t.Fatalf("events = %+v, want just the intact record", events)
	}
}

func TestSpoolIsUsableAsARecorderFromTheProxy(t *testing.T) {
	// End to end through the listener: a real decision lands durably on disk.
	upstream := echoServer(t)
	s, path := newSpool(t, SpoolOptions{})

	p := &Proxy{
		ConfigFor: func() Config { return openInternetCfg() },
		Recorder:  s,
	}
	if err := p.Listen("127.0.0.1:0"); err != nil {
		t.Fatalf("Listen: %v", err)
	}
	go func() { _ = p.Serve() }()

	_, conn, _ := connect(t, p.Addr().String(), upstream.Addr().String())
	conn.Close()

	if err := p.Close(); err != nil {
		t.Fatalf("proxy Close: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("spool Close: %v", err)
	}

	events, err := readSpool(path)
	if err != nil {
		t.Fatalf("readSpool: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("read %d events, want 1", len(events))
	}
	if !events[0].Allowed || events[0].CertID != "cert-1" {
		t.Errorf("event = %+v", events[0])
	}
}
