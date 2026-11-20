package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/vconn"
)

func TestOutboxClaimsThenDeliversAfterGraceAndDeletesOnAck(t *testing.T) {
	dir := t.TempDir()
	live := filepath.Join(dir, "audit-alice.jsonl")
	var lines []string
	for i := 0; i < 5; i++ {
		lines = append(lines, `{"id":"r`+string(rune('0'+i))+`","kind":"pre_tool"}`)
	}
	lines = append(lines, `{torn`)
	if err := os.WriteFile(live, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	clock := time.Unix(1_000, 0)
	o := &Outbox{Dir: dir, MaxBatch: 2, Grace: 2 * time.Second, Now: func() time.Time { return clock }}

	// Round 1: claims the live file, offers nothing.
	if msgs, _ := o.Next(); len(msgs) != 0 {
		t.Fatalf("round 1 must only claim, got %d messages", len(msgs))
	}
	if _, err := os.Stat(live); !os.IsNotExist(err) {
		t.Fatal("the live spool must have been renamed aside")
	}

	// Within the grace period: still nothing.
	clock = clock.Add(time.Second)
	if msgs, _ := o.Next(); len(msgs) != 0 {
		t.Fatal("a claim younger than the grace period must not be read")
	}

	// After it: 5 valid records in batches of 2, the torn line skipped.
	clock = clock.Add(2 * time.Second)
	msgs, ack := o.Next()
	if len(msgs) != 3 {
		t.Fatalf("want 3 batches, got %d", len(msgs))
	}
	total := 0
	for _, m := range msgs {
		if m.Type != vconn.MsgHookAudit {
			t.Fatalf("type = %s", m.Type)
		}
		var p vconn.HookAuditPayload
		if err := m.Decode(&p); err != nil {
			t.Fatal(err)
		}
		total += len(p.Events)
		for _, e := range p.Events {
			if !json.Valid(e) {
				t.Fatal("an invalid line was forwarded")
			}
		}
	}
	if total != 5 {
		t.Fatalf("want 5 records, got %d", total)
	}

	// Not acked (connection dropped): offered again, unchanged.
	if again, _ := o.Next(); len(again) != 3 {
		t.Fatal("an unacknowledged claim must be re-offered")
	}

	ack()
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Fatalf("ack must delete the delivered file, left %v", entries)
	}
}

func TestOutboxIgnoresEmptyFiles(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "audit.jsonl"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	o := &Outbox{Dir: dir, Grace: 0}
	o.Next()
	if _, err := os.Stat(filepath.Join(dir, "audit.jsonl")); err != nil {
		t.Fatal("an empty spool must be left alone, not claimed")
	}
}
