// Package hook is the hot path: `vaultysclaw-hooks hook --vendor=X --event=Y`,
// executed by a harness once per hook event.
//
// It reads the payload from stdin, normalises it through the vendor's adapter,
// decides a pre-tool event with sdk-go/toolgate from the signed policy on disk,
// answers the harness in its own format, and appends an audit record.
//
// Failure posture follows the mode, and is the one place this package differs
// deliberately from vaultysclaw-sensor's supervisor shim:
//
//   - observe: anything that goes wrong passes, silently to the harness and
//     loudly in the audit trail. Observe mode must never break a developer.
//   - enforce: a decision point that cannot be evaluated — unparseable payload,
//     unverifiable policy, a panic — is refused. Here the hook *is* the gate;
//     there is no kernel sandbox behind it to catch what it lets through.
//
// Events other than pre-tool never block, in either mode.
package hook

import (
	"errors"
	"fmt"
	"io"
	"runtime/debug"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/toolgate"
	"github.com/vaultys/vaultysclaw-hooks/internal/adapter"
	"github.com/vaultys/vaultysclaw-hooks/internal/audit"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// maxPayload caps stdin. Hook payloads are a few KB; a tool input carrying a
// whole file can be larger, but nothing legitimate approaches this.
const maxPayload = 8 << 20

// Options is one invocation.
type Options struct {
	Vendor string
	Event  string
	Paths  state.Paths
	// ExtraOwn are further files to protect on the floor, such as the settings
	// file that installs this hook.
	ExtraOwn []toolgate.FloorPath
	Stdin    io.Reader
	Stdout   io.Writer
	Stderr   io.Writer
	Now      func() time.Time
}

// Run handles one invocation and returns the process exit code.
func Run(o Options) (code int) {
	now := time.Now
	if o.Now != nil {
		now = o.Now
	}
	t := now()

	ad, err := adapter.Lookup(o.Vendor)
	if err != nil {
		// No adapter means no way to speak the harness's protocol at all, so
		// nothing useful can be written to stdout. Exit 0: an installed hook
		// with a typo must not wedge the harness, and doctor reports it.
		fmt.Fprintln(o.Stderr, "vaultysclaw-hooks:", err)
		return 0
	}

	cfg, cfgErr := state.LoadConfig(o.Paths.Config)
	rec := audit.Record{Time: t, Vendor: ad.Vendor(), Event: o.Event, Kind: string(ad.Kind(o.Event)), Mode: string(cfg.Mode)}
	ev := adapter.Event{Vendor: ad.Vendor(), Kind: ad.Kind(o.Event), RawEvent: o.Event}

	defer func() {
		if r := recover(); r != nil {
			rec.Error = fmt.Sprintf("panic: %v", r)
			fmt.Fprintf(o.Stderr, "vaultysclaw-hooks: panic: %v\n%s", r, debug.Stack())
			code = failure(ad, ev, cfg, &rec, o)
		}
		if aerr := audit.Append(o.Paths.Spool, rec); aerr != nil {
			fmt.Fprintln(o.Stderr, "vaultysclaw-hooks: audit:", aerr)
		}
	}()

	if cfgErr != nil {
		// An unreadable config might have said enforce. Treat it as enforce for
		// decision points: guessing observe would let a corrupted file switch
		// the gate off.
		cfg.Mode = state.ModeEnforce
		rec.Mode = string(cfg.Mode)
		rec.Error = cfgErr.Error()
		return failure(ad, ev, cfg, &rec, o)
	}

	payload, err := io.ReadAll(io.LimitReader(o.Stdin, maxPayload+1))
	if err == nil && len(payload) > maxPayload {
		err = errors.New("payload exceeds 8 MiB")
	}
	if err != nil {
		rec.Error = "reading payload: " + err.Error()
		return failure(ad, ev, cfg, &rec, o)
	}

	parsed, err := ad.Parse(o.Event, payload)
	if err != nil {
		rec.Error = err.Error()
		return failure(ad, ev, cfg, &rec, o)
	}
	ev = parsed
	rec.Event, rec.Kind = ev.RawEvent, string(ev.Kind)
	rec.Session, rec.Cwd = ev.Session, ev.Cwd
	rec.Tool, rec.VendorTool = ev.Tool, ev.VendorTool

	if ev.Kind != adapter.KindPreTool {
		return ad.Respond(ev, adapter.Verdict{}, o.Stdout)
	}

	pol, err := state.LoadPolicy(o.Paths, t)
	if err != nil {
		rec.Error = err.Error()
		return failure(ad, ev, cfg, &rec, o)
	}

	floor := state.Floor(cfg, o.Paths, o.ExtraOwn...)
	action, mapErr := toolgate.MapToolCall(ev.Tool, ev.Input, ev.Cwd)
	out := toolgate.Decide(state.ToolgateConfig(cfg, pol, floor), action, mapErr, t)

	rec.Decided = true
	rec.Capability, rec.Resource = string(action.Capability), action.Resource
	rec.Blocked = !out.Allowed
	rec.WouldDeny, rec.Unmapped, rec.NoResource, rec.FloorRefused = out.WouldDeny, out.Unmapped, out.NoResource, out.FloorRefused
	rec.RuleID, rec.CertID, rec.Reason = out.RuleID, out.GrantingCertID, out.Reason

	return respond(ad, ev, adapter.Verdict{Deny: !out.Allowed, Reason: "vaultysclaw: " + out.Reason}, o)
}

// failure answers an invocation that could not be evaluated normally.
func failure(ad adapter.Adapter, ev adapter.Event, cfg state.Config, rec *audit.Record, o Options) int {
	if ev.Kind == adapter.KindPreTool && cfg.Mode == state.ModeEnforce {
		rec.Decided, rec.Blocked = true, true
		rec.Reason = "refused: the call could not be evaluated (" + rec.Error + ")"
		return respond(ad, ev, adapter.Verdict{Deny: true, Reason: "vaultysclaw: " + rec.Reason}, o)
	}
	// Observe mode, or not a decision point: pass, and let the audit record
	// carry the error.
	return 0
}

func respond(ad adapter.Adapter, ev adapter.Event, v adapter.Verdict, o Options) int {
	code := ad.Respond(ev, v, o.Stdout)
	if code != 0 && v.Deny {
		// The adapter fell back to its exit-code channel; the reason travels on
		// stderr, which is where harnesses read it on that path.
		fmt.Fprintln(o.Stderr, v.Reason)
	}
	return code
}
