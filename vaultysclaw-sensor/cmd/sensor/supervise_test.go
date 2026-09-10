package main

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"
)

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// The whole point of the startup wait is that it is bounded in every direction:
// a host that will never be pushed to, and a control plane that never answers,
// must both launch. A hang here is worse than the stale profile the wait exists
// to prevent — it stops the harness starting at all.
func TestAwaitFirstConfigReturnsWithoutAPush(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		ch      <-chan struct{}
		timeout time.Duration
	}{
		// File-provisioned: nothing will ever push, so there is nothing to wait
		// for and the operator must not pay for the wait.
		{"no control plane", nil, 3 * time.Second},
		// The documented opt-out.
		{"wait disabled", make(chan struct{}), 0},
		{"negative timeout", make(chan struct{}), -1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			done := make(chan struct{})
			go func() {
				awaitFirstConfig(context.Background(), quietLogger(), tc.ch, tc.timeout)
				close(done)
			}()
			select {
			case <-done:
			case <-time.After(2 * time.Second):
				t.Fatal("awaitFirstConfig blocked when it had nothing to wait for")
			}
		})
	}
}

func TestAwaitFirstConfigReturnsOnPush(t *testing.T) {
	t.Parallel()
	l := &latch{ch: make(chan struct{})}
	go func() {
		time.Sleep(20 * time.Millisecond)
		l.arrived()
	}()

	start := time.Now()
	// A generous timeout: what this asserts is that the push is what ended the
	// wait, not the clock.
	awaitFirstConfig(context.Background(), quietLogger(), l.ch, 10*time.Second)
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("waited %s — the push did not end the wait", elapsed)
	}
}

func TestAwaitFirstConfigGivesUpAfterTheTimeout(t *testing.T) {
	t.Parallel()
	start := time.Now()
	awaitFirstConfig(context.Background(), quietLogger(), make(chan struct{}), 50*time.Millisecond)
	if elapsed := time.Since(start); elapsed < 50*time.Millisecond {
		t.Fatalf("returned after %s, before the %s timeout", elapsed, 50*time.Millisecond)
	}
}

func TestAwaitFirstConfigReturnsOnCancellation(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	start := time.Now()
	awaitFirstConfig(ctx, quietLogger(), make(chan struct{}), time.Hour)
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("waited %s — Ctrl-C during the startup wait must not hang the launch", elapsed)
	}
}

// The latch is signalled from OnActorConfig, which runs once per push, so the
// second push must not panic on a closed channel.
func TestLatchIsIdempotentUnderConcurrentPushes(t *testing.T) {
	t.Parallel()
	l := &latch{ch: make(chan struct{})}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			l.arrived()
		}()
	}
	wg.Wait()
	select {
	case <-l.ch:
	default:
		t.Fatal("the latch was never signalled")
	}
}
