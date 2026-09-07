package supervise

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
	"github.com/vaultys/VaultysClaw/sdk-go/rules"
	"github.com/vaultys/vaultysclaw-sensor/internal/intercept"
)

// memRecorder captures spool events without touching a file.
type memRecorder struct {
	mu     sync.Mutex
	events []intercept.Event
}

func (r *memRecorder) Record(e intercept.Event) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, e)
}

func (r *memRecorder) all() []intercept.Event {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]intercept.Event(nil), r.events...)
}

// liveConfig is baseConfig with its status freshly synced. The daemon reads the
// real clock — that is what production does — so a config pinned to the
// decide_test fixture clock would be stale by however long ago that date was.
func liveConfig(mode Mode, floor *Floor, certs ...authz.Certificate) Config {
	cfg := baseConfig(mode, floor, certs...)
	cfg.SyncedAt = time.Now()
	return cfg
}

// startDaemon brings up a real daemon on a real unix socket.
func startDaemon(t *testing.T, cfg Config) (string, *memRecorder) {
	t.Helper()
	rec := &memRecorder{}
	d := &Daemon{ConfigFor: func() Config { return cfg }, Recorder: rec}

	// Not t.TempDir(): a macOS temp path is long enough to exceed the ~104-byte
	// sun_path limit for unix sockets once a test name is in it.
	dir, err := os.MkdirTemp("", "sv")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	path := filepath.Join(dir, "s.sock")
	if err := d.Listen(path); err != nil {
		t.Fatal(err)
	}
	go func() { _ = d.Serve() }()
	t.Cleanup(func() { d.Close() })
	return path, rec
}

func TestHookEndToEndOverTheSocket(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	repo := filepath.Join(home, "repo")
	ssh := filepath.Join(home, ".ssh")
	for _, d := range []string{repo, ssh} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	resolvedHome, _ := filepath.EvalSymlinks(home)
	resolvedRepo := filepath.Join(resolvedHome, "repo")

	cfg := liveConfig(ModeExplicit, NewFloor([]string{"~/.ssh"}),
		cert("cert-repo", FileURI(resolvedRepo)+"/*", CapFileRead, CapFileWrite))
	socket, rec := startDaemon(t, cfg)

	run := func(tool, input string) ClaudeHookDecision {
		t.Helper()
		payload, _ := json.Marshal(ClaudeHookInput{
			SessionID: "sess-1", Cwd: repo, HookEventName: "PreToolUse",
			ToolName: tool, ToolInput: json.RawMessage(input),
		})
		var out bytes.Buffer
		if err := RunClaudeHook(socket, bytes.NewReader(payload), &out); err != nil {
			t.Fatalf("hook failed: %v", err)
		}
		var decoded ClaudeHookOutput
		if err := json.Unmarshal(out.Bytes(), &decoded); err != nil {
			t.Fatalf("hook wrote unparseable output %q: %v", out.String(), err)
		}
		if decoded.HookSpecificOutput.HookEventName != "PreToolUse" {
			t.Errorf("hookEventName = %q, want PreToolUse", decoded.HookSpecificOutput.HookEventName)
		}
		return decoded.HookSpecificOutput
	}

	t.Run("an in-scope edit is allowed", func(t *testing.T) {
		got := run("Edit", `{"file_path":"`+repo+`/main.go"}`)
		if got.PermissionDecision != "allow" {
			t.Fatalf("decision = %q (%s), want allow", got.PermissionDecision, got.PermissionDecisionReason)
		}
	})

	t.Run("a private key is denied, with a reason the model can act on", func(t *testing.T) {
		got := run("Read", `{"file_path":"`+ssh+`/id_ed25519"}`)
		if got.PermissionDecision != "deny" {
			t.Fatalf("decision = %q, want deny", got.PermissionDecision)
		}
		if !strings.Contains(got.PermissionDecisionReason, "safety floor") {
			t.Errorf("reason = %q, want it to name the safety floor", got.PermissionDecisionReason)
		}
	})

	t.Run("every call reached the spool with its resource and capability", func(t *testing.T) {
		events := rec.all()
		if len(events) != 2 {
			t.Fatalf("recorded %d events, want 2 — a decision that is not audited did not happen", len(events))
		}
		if events[0].Tool != "Edit" || events[0].Capability != "file_write" {
			t.Errorf("event 0 = %+v, want the Edit/file_write pair", events[0])
		}
		if !strings.HasPrefix(events[0].Resource, "file://") {
			t.Errorf("resource = %q, want a file:// URI", events[0].Resource)
		}
		if events[0].CertID != "cert-repo" {
			t.Errorf("certId = %q, want the granting certificate recorded", events[0].CertID)
		}
		if events[1].Allowed {
			t.Error("the denied call must be recorded as denied")
		}
		if events[1].ClientAddr != "sess-1" {
			t.Errorf("session = %q, want it carried into the record", events[1].ClientAddr)
		}
	})
}

func TestHookFailsOpenLoudlyWhenTheDaemonIsGone(t *testing.T) {
	// The shim cannot be a security boundary — anything that can stop the daemon
	// can remove the hook too — so it passes. What it must not do is pass in
	// silence.
	var out bytes.Buffer
	payload, _ := json.Marshal(ClaudeHookInput{ToolName: "Read", Cwd: "/tmp", ToolInput: json.RawMessage(`{"file_path":"/tmp/x"}`)})
	if err := RunClaudeHook("/nonexistent/vaultysclaw.sock", bytes.NewReader(payload), &out); err != nil {
		t.Fatalf("the hook must still produce a decision: %v", err)
	}
	var decoded ClaudeHookOutput
	if err := json.Unmarshal(out.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.HookSpecificOutput.PermissionDecision != "allow" {
		t.Errorf("decision = %q, want allow", decoded.HookSpecificOutput.PermissionDecision)
	}
	if !strings.Contains(decoded.HookSpecificOutput.PermissionDecisionReason, "ungoverned") {
		t.Errorf("reason = %q, want it to say the call went ungoverned", decoded.HookSpecificOutput.PermissionDecisionReason)
	}
}

func TestDaemonRefusesAMalformedRequest(t *testing.T) {
	// The daemon's own posture is the opposite of the shim's: a request it
	// cannot parse has not been judged, and permitting it would make malformed
	// input the way past the gate.
	socket, _ := startDaemon(t, liveConfig(ModeExplicit, nil, cert("c", "", CapFileRead)))

	conn, err := dialUnix(socket)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(2 * time.Second))
	if _, err := conn.Write([]byte("{not json\n")); err != nil {
		t.Fatal(err)
	}
	var resp Response
	if err := json.NewDecoder(conn).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.Allowed {
		t.Error("a malformed request must be refused, not permitted")
	}
}

func TestDaemonSocketIsOwnerOnly(t *testing.T) {
	// The socket answers as this host's granted identity, and nothing
	// authenticates on it. File permissions are the only access control there is.
	socket, _ := startDaemon(t, liveConfig(ModeObserve, nil))
	info, err := os.Stat(socket)
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("socket mode = %o, want 600", perm)
	}
}

func TestDaemonAnnouncesObserveModeInEveryResponse(t *testing.T) {
	// A shim must be able to say "advisory" without being configured separately,
	// or the two halves can disagree about whether anything is being enforced.
	socket, _ := startDaemon(t, liveConfig(ModeObserve, nil))
	resp, err := Ask(socket, Request{Tool: "Read", Cwd: "/tmp", Input: json.RawMessage(`{"file_path":"/tmp/x"}`)})
	if err != nil {
		t.Fatal(err)
	}
	if resp.Mode != ModeObserve {
		t.Errorf("mode = %q, want observe", resp.Mode)
	}
	if !resp.Allowed {
		t.Errorf("observe mode must permit; got %q", resp.Reason)
	}
}

func TestProbeIsAnsweredButNeverRecorded(t *testing.T) {
	// Preflight asks through the real path to prove the socket answers. That
	// synthetic call must not reach the spool: counted as an ungoverned pass, it
	// would inflate the coverage metric with events no agent ever made.
	socket, rec := startDaemon(t, liveConfig(ModeObserve, nil))

	if _, err := Ask(socket, Request{Tool: "preflight", Cwd: "/tmp", Probe: true}); err != nil {
		t.Fatalf("a probe must still get an answer: %v", err)
	}
	if got := rec.all(); len(got) != 0 {
		t.Fatalf("recorded %d events for a probe, want 0: %+v", len(got), got)
	}

	// The same call without the flag is an ordinary decision and is recorded.
	if _, err := Ask(socket, Request{Tool: "Read", Cwd: "/tmp", Input: json.RawMessage(`{"file_path":"/tmp/x"}`)}); err != nil {
		t.Fatal(err)
	}
	if got := rec.all(); len(got) != 1 {
		t.Fatalf("recorded %d events for a real call, want 1", len(got))
	}
}

func TestListenRejectsAnOverlongSocketPathWithAUsefulMessage(t *testing.T) {
	// Found by running a real session out of a deep scratch directory: the
	// kernel reports "bind: invalid argument", which tells an operator nothing.
	// A limit that is hit in practice deserves a sentence, not an errno.
	d := &Daemon{ConfigFor: func() Config { return Config{} }}
	long := "/tmp/" + strings.Repeat("d/", 60) + "s.sock"

	err := d.Listen(long)
	if err == nil {
		t.Fatal("an overlong socket path must be refused before bind")
	}
	for _, want := range []string{"over the", "supervise.socketPath", "shorter"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q should mention %q", err, want)
		}
	}
}

func TestARuleChangeAppliesToTheNextToolCall(t *testing.T) {
	// The claim an operator relies on: editing policy in the console does not
	// require restarting a running session. ConfigFor is a function precisely so
	// the store can be re-read per decision.
	cfg := liveConfig(ModeExplicit, nil, cert("c", "", CapFileRead))
	var mu sync.Mutex
	live := cfg

	rec := &memRecorder{}
	d := &Daemon{
		ConfigFor: func() Config {
			mu.Lock()
			defer mu.Unlock()
			return live
		},
		Recorder: rec,
	}

	// Resolved, because the decider canonicalizes every path before matching —
	// authoring "file:///tmp/*" on macOS matches nothing, which is exactly the
	// trap proxyResourceRuleWarnings warns admins about, and which this test hit
	// on its first run.
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(dir, "x")

	read := Request{Tool: "Read", Cwd: dir, Input: json.RawMessage(`{"file_path":"` + target + `"}`)}
	if resp := d.Decide(read); !resp.Allowed {
		t.Fatalf("expected the certificate to allow this first; got %q", resp.Reason)
	}

	// A deny rule arrives — no restart, no new daemon, no reconnect.
	mu.Lock()
	live.Rules = &rules.Set{Version: 1, ResourceRules: []rules.ResourceRule{
		{ID: "no-tmp", Subject: rules.SubjectAny, Resources: []string{FileURI(dir) + "/*"}, Effect: rules.EffectDeny},
	}}
	mu.Unlock()

	resp := d.Decide(read)
	if resp.Allowed {
		t.Fatal("a rule added mid-session must apply to the next tool call")
	}
	if !strings.Contains(resp.Reason, "no-tmp") {
		t.Errorf("reason = %q, want the new rule named", resp.Reason)
	}
}

func TestAModeChangeAppliesToTheNextToolCall(t *testing.T) {
	settings := NewSettings(ModeObserve, time.Hour, true)
	base := liveConfig(ModeObserve, nil) // no certificate: everything is uncovered

	d := &Daemon{ConfigFor: func() Config {
		c := base
		c.Mode, c.MaxStatusAge, c.FailClosed = settings.Snapshot()
		return c
	}}

	read := Request{Tool: "Read", Cwd: "/tmp", Input: json.RawMessage(`{"file_path":"/tmp/x"}`)}
	if resp := d.Decide(read); !resp.Allowed {
		t.Fatal("observe mode must permit")
	}

	explicit := string(ModeExplicit)
	settings.Apply(&explicit, nil)

	if resp := d.Decide(read); resp.Allowed {
		t.Fatal("switching to explicit mid-session must apply to the next tool call")
	}
}
