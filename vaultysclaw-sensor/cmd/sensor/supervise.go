package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/VaultysClaw/sdk-go/vconn"

	"github.com/vaultys/vaultysclaw-sensor/internal/config"
	"github.com/vaultys/vaultysclaw-sensor/internal/intercept"
	"github.com/vaultys/vaultysclaw-sensor/internal/supervise"
)

// runSupervise launches a coding harness under tier-A tool-call governance
// (docs/HARNESS_SUPERVISOR.md §4): it starts the decision daemon, generates the
// harness settings that install the PreToolUse hook, runs the harness as a
// child, and shuts the daemon down when the harness exits.
//
// Every failure here is fatal rather than degraded, for the same reason
// startIntercept's are: a harness running with a hook that silently never fires
// looks exactly like a governed one, and an operator who believes they are
// supervising something must not be quietly wrong.
func runSupervise(ctx context.Context, cfg *config.Sensor, logger *slog.Logger, command []string) error {
	sv := cfg.Supervise
	if !sv.Enabled {
		return fmt.Errorf("supervise: the supervise role is disabled — set supervise.enabled: true in the config")
	}
	if len(command) == 0 {
		return fmt.Errorf("supervise: no harness command given (usage: vaultysclaw-sensor supervise -- claude)")
	}

	anchor, err := pinAnchor("supervise", sv.AnchorPath, sv.ControlPlaneID)
	if err != nil {
		return err
	}
	logger.Info("supervise: control-plane anchor pinned", "did", anchor.DID(), "path", sv.AnchorPath)

	// The same Store the intercept role uses, and deliberately so: one verified
	// grant, one verified rule set, one staleness clock. Only the rule set's
	// resource half is consulted by this role; its host half belongs to the
	// proxy, and the two never interact.
	//
	// AttributionAvailable is false, which makes the Store refuse a set
	// containing subject-scoped rules. That is right rather than pessimistic:
	// this role knows its subject structurally (it launched the harness) but has
	// no *workload* vocabulary to match one against, so a `subject: workload`
	// rule here could never match and must fail at load rather than at every
	// call.
	// A grant is optional only when something will deliver one. With a control
	// plane configured, refusing to start would make bootstrapping impossible:
	// this host needs a grant to start and can only obtain one by starting.
	// Without a control plane, nothing will ever provide it, so a missing grant
	// stays fatal exactly as it is for the intercept role.
	connected := strings.TrimSpace(sv.ControlPlaneURL) != ""
	store, err := intercept.NewStore(intercept.StoreOptions{
		Anchor:               anchor,
		GrantPath:            sv.GrantPath,
		RuleSetPath:          sv.RuleSetPath,
		AttributionAvailable: false,
		AllowUnprovisioned:   connected,
	})
	if err != nil {
		return err
	}
	if store.Provisioned() {
		logger.Info("supervise: policy loaded", "summary", store.Summary())
	} else {
		// Loud, and phrased as what it means rather than what is missing: an
		// operator watching a harness that refuses everything must not have to
		// infer why.
		logger.Warn("supervise: no capability grant yet — this host authorizes nothing until the control plane issues one. " +
			"Approve its registration and issue it a packcert certificate (Certificates → Issue), not only a registration approval.")
	}

	spool, err := intercept.NewFileSpool(sv.SpoolPath, intercept.SpoolOptions{})
	if err != nil {
		return err
	}
	defer func() {
		if stats := spool.Stats(); stats.Dropped > 0 {
			logger.Warn("supervise: audit events were dropped", "dropped", stats.Dropped)
		}
		_ = spool.Close()
	}()

	// The local floor is a **default safety net**, not the place a deployment
	// expresses policy. Signed resource rules are the source of truth: they are
	// evaluated first, so an `allow` rule lifts a floor entry, and every signed
	// `deny file://…` now also becomes a kernel-enforced deny in the tier-B
	// profile — so an admin authors a deny once, in the console, and gets both
	// the reasoned refusal and the unbypassable one from it.
	//
	// What the floor is not allowed to be is optional. Adding policy must never
	// remove protection, so it is a union with the signed rules rather than
	// something they replace.
	floorPaths := sv.FloorPaths
	if len(floorPaths) == 0 {
		floorPaths = supervise.DefaultFloorPaths
	}
	// The supervisor's own artefacts go on the floor unconditionally, whatever
	// the operator configured: a supervisor whose grant, anchor and hook
	// settings are writable by what it supervises is not supervising anything.
	floor := supervise.NewFloor(floorPaths,
		supervise.FloorPath{Path: sv.GrantPath, Reason: "this supervisor's own capability grant"},
		supervise.FloorPath{Path: sv.AnchorPath, Reason: "this supervisor's own control-plane trust anchor"},
		supervise.FloorPath{Path: sv.SettingsPath, Reason: "the harness settings that install this supervisor's hook"},
		supervise.FloorPath{Path: sv.SpoolPath, Reason: "this supervisor's own audit spool"},
	)

	mode := supervise.Mode(sv.Mode)
	maxStatusAge := time.Duration(sv.MaxStatusAgeSeconds) * time.Second
	if sv.MaxStatusAgeSeconds < 0 {
		logger.Warn("supervise: maxStatusAgeSeconds is negative — certificate status will back decisions indefinitely without a refresh")
	} else if sv.MaxStatusAgeSeconds == 0 && sv.FailClosed {
		logger.Warn("supervise: maxStatusAgeSeconds is 0 with failClosed — every governed tool call will be denied, since an offline decider cannot perform the live status check that setting demands")
	}

	// Everything the decider reads is read *per decision*, not captured at
	// launch: the certificate and rules come from the store, and mode and the
	// staleness bound from settings. A rule an admin adds, or a mode they
	// change, applies to the very next tool call.
	settings := supervise.NewSettings(mode, maxStatusAge, sv.FailClosed)
	interceptConfig := store.ConfigFor(maxStatusAge, sv.FailClosed)
	daemon := &supervise.Daemon{
		ConfigFor: func() supervise.Config {
			c := interceptConfig()
			liveMode, liveMaxAge, liveFailClosed := settings.Snapshot()
			return supervise.Config{
				Mode:         liveMode,
				Certs:        c.Certs,
				Rules:        c.Rules,
				Floor:        floor,
				MaxStatusAge: liveMaxAge,
				SyncedAt:     c.SyncedAt,
				FailClosed:   liveFailClosed,
			}
		},
		Recorder: spool,
		Logger:   logger,
	}
	if err := daemon.Listen(sv.SocketPath); err != nil {
		return err
	}
	defer daemon.Close()
	go func() {
		if err := daemon.Serve(); err != nil {
			logger.Error("supervise: decision daemon stopped", "err", err)
		}
	}()

	// The optional control-plane connection. Everything above already works
	// without it — the artefacts are verified against the pinned anchor whether
	// they arrived over this socket or were placed on disk by hand — so a
	// failure to connect degrades convenience, never authority, and must not
	// stop a supervisor that is already correctly provisioned.
	//
	// firstConfig stays nil when nothing will ever push, which awaitFirstConfig
	// reads as "no reason to wait" — a file-provisioned host is already running
	// current policy and must not pay a startup delay for a sync that cannot
	// happen.
	var firstConfig <-chan struct{}
	if connected {
		stopConn, ready, err := startSuperviseConnection(ctx, cfg, logger, store, anchor, settings)
		if err != nil {
			return err
		}
		defer stopConn()
		firstConfig = ready
	} else {
		logger.Info("supervise: no controlPlaneUrl configured; running fully file-provisioned")
	}

	// Wait for the first push *before* compiling the tier-B profile below.
	//
	// Tier A re-reads the store per decision, so a rule that lands mid-session
	// applies to the next tool call. The kernel profile cannot: it is applied to
	// the harness at exec time and a running process cannot be re-confined. So
	// the one moment when a push has to have arrived is this one — launching
	// first means confining the session with the previous rule set while the
	// console shows the current one, and a kernel refusal carries no reason
	// string to reveal the discrepancy.
	awaitFirstConfig(ctx, logger, firstConfig, time.Duration(sv.StartupSyncTimeoutMs)*time.Millisecond)

	self, err := os.Executable()
	if err != nil {
		return fmt.Errorf("supervise: locating this binary for the hook command: %w", err)
	}
	cwd, _ := os.Getwd()

	// Tier B. The spec comes from the same Floor tier A decides with, so an
	// operator configures the deny list once and gets both the reasoned refusal
	// and the unbypassable one from the same entry.
	var sandbox *supervise.Sandbox
	if sv.Sandbox != config.SandboxOff {
		spec := supervise.SpecFromPolicy(interceptConfig().Rules, floor,
			[]string{sv.GrantPath, sv.AnchorPath, sv.SettingsPath, sv.SpoolPath})
		if err := checkHarnessIsLaunchable(spec, command[0]); err != nil {
			return err
		}
		sandbox, err = supervise.NewSandbox(spec, filepath.Dir(sv.SocketPath))
		switch {
		case err == nil:
			defer sandbox.Close()
			// The exact deny list this session is confined by, signed rules and
			// floor together, resolved. A kernel refusal reaches the agent as a
			// bare EPERM with no reason, so this log line is the only way an
			// operator can attribute one — and the only way they can see that a
			// path they never configured locally was denied by a signed rule.
			logger.Info("supervise: tier-B profile compiled",
				"denyAll", spec.DenyAll,
				"denyWrite", spec.DenyWrite,
				"note", "fixed for this session: OS confinement is applied at exec time and cannot be changed while the harness runs")
		case sv.Sandbox == config.SandboxRequire:
			return fmt.Errorf("supervise: sandbox is set to %q and confinement could not be established: %w", config.SandboxRequire, err)
		default:
			// auto: continue, but an operator must never have to infer that
			// confinement silently did not happen.
			logger.Warn("supervise: OS confinement could not be established; continuing without tier B", "err", err)
		}
	}

	cmd, err := supervise.BuildLaunch(ctx, supervise.LaunchOptions{
		Harness:      supervise.HarnessClaudeCode,
		Command:      command,
		SocketPath:   sv.SocketPath,
		SelfPath:     self,
		SettingsPath: sv.SettingsPath,
		Dir:          cwd,
		Sandbox:      sandbox,
	})
	if err != nil {
		return err
	}

	logger.Info("supervise: governing harness",
		"harness", supervise.HarnessClaudeCode,
		"command", filepath.Base(command[0]),
		"mode", mode,
		"socket", sv.SocketPath,
		"spool", sv.SpoolPath,
		"floor", floor.Paths(),
		// Which capabilities are actually gated, not which exist. A tool outside
		// this set passes ungoverned even in explicit mode, and an operator who
		// assumes otherwise has a false picture of their own coverage.
		"enforcedCapabilities", supervise.EnforcedCapabilities(),
		"ungovernedTools", supervise.UngovernedNotice,
	)
	if mode == supervise.ModeObserve {
		logger.Warn("supervise: OBSERVE mode — every tool call is decided and recorded, and none are refused")
	}
	// §7: an operator must be told exactly what is and is not in force, in both
	// modes, every launch.
	if sandbox != nil {
		logger.Info("supervise: OS confinement active", "mechanism", sandbox.Description)
		logger.Warn("supervise: " + supervise.ConfinedNotice)
	} else {
		logger.Warn("supervise: " + supervise.AdvisoryNotice)
	}

	err = cmd.Run()
	if exitErr, ok := err.(*exec.ExitError); ok {
		// The harness's own exit code is the operator's result, not ours. A
		// supervisor that turns a failing build into "supervision failed" is
		// worse than useless.
		logger.Info("supervise: harness exited", "code", exitErr.ExitCode())
		return nil
	}
	return err
}

// checkHarnessIsLaunchable refuses a launch whose own confinement would deny
// executing the harness.
//
// Caught here because of how it surfaces otherwise: sandbox-exec reports
// `execvp() of '…/claude' failed: Operation not permitted` and the supervisor
// reports the harness's exit code, so an operator sees a failed launch that
// names neither the deny list nor the rule behind it — and the supervisor's own
// preceding log line says confinement is working, which it is. The
// misconfiguration is upstream, in a rule that covers more than its author
// meant.
//
// A `deny file:///Users/someone/*` rule is the way in. It reads as "keep the
// agent out of that home directory" and is also, to the kernel, "deny
// ~/.local/bin/claude" — the harness binary, its state directory, and its
// caches. Fatal rather than a warning: the launch cannot succeed, and the
// alternative of carving the harness path back out would enforce a policy
// nobody authored.
func checkHarnessIsLaunchable(spec supervise.SandboxSpec, harness string) error {
	// The resolved binary, not the word typed on the command line: what the
	// kernel checks is the path exec actually reaches. A harness that is not on
	// PATH is BuildLaunch's error to report, not this check's to guess at.
	path, err := exec.LookPath(harness)
	if err != nil {
		return nil
	}
	denied, entry := spec.DeniesExecutable(path)
	if !denied {
		return nil
	}
	return fmt.Errorf(
		"supervise: refusing to launch — OS confinement would deny executing the harness itself: %s is inside the denied path %s.\n"+
			"That entry is either a signed `deny file://…` rule or a supervise.floorPaths entry, and it covers more than the harness's own binary: "+
			"its state directory and caches are beneath the same path.\n"+
			"Narrow the rule to what it is meant to protect (a home-directory-wide deny always includes the harness), "+
			"or set supervise.sandbox: off to run with tier-A governance only",
		path, entry)
}

// runHook is the shim the harness executes before every tool call. It must stay
// tiny and must not touch the config file: it runs once per tool call, and
// anything it does is on the critical path of the agent's work.
func runHook(socketPath string) error {
	return supervise.RunClaudeHook(socketPath, os.Stdin, os.Stdout)
}

// runSuperviseReport summarizes an observe-mode spool. Phase 0's deliverable is
// knowledge (docs/HARNESS_SUPERVISOR.md §4), and knowledge nobody can read is
// not a deliverable — this is what turns a week of observation into the scope
// string an admin pastes into the issuance form.
func runSuperviseReport(configPath string, maxResources int) error {
	cfg, err := config.LoadSensorConfig(configPath)
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}
	events, err := intercept.ReadSpool(cfg.Supervise.SpoolPath)
	if err != nil {
		return err
	}
	fmt.Print(supervise.BuildReport(events).Format(maxResources))
	return nil
}

// runSandboxCheck answers "is confinement actually in force on this machine,
// for my floor?" without launching a harness. Worth its own subcommand because
// sandbox-exec is deprecated: the answer can change under an OS update, and
// every way it fails is silent.
func runSandboxCheck(configPath string) error {
	cfg, err := config.LoadSensorConfig(configPath)
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}
	sv := cfg.Supervise

	floorPaths := sv.FloorPaths
	if len(floorPaths) == 0 {
		floorPaths = supervise.DefaultFloorPaths
	}
	floor := supervise.NewFloor(floorPaths,
		supervise.FloorPath{Path: sv.GrantPath, Reason: "own capability grant"},
		supervise.FloorPath{Path: sv.AnchorPath, Reason: "own trust anchor"},
		supervise.FloorPath{Path: sv.SettingsPath, Reason: "own harness settings"},
		supervise.FloorPath{Path: sv.SpoolPath, Reason: "own audit spool"},
	)
	spec := supervise.SpecFromFloor(floor, []string{sv.GrantPath, sv.AnchorPath, sv.SettingsPath, sv.SpoolPath})

	sandbox, err := supervise.NewSandbox(spec, os.TempDir())
	if err != nil {
		return fmt.Errorf("confinement could not be established: %w", err)
	}
	defer sandbox.Close()

	fmt.Printf("%s\n\n", sandbox.Description)
	report, ok := supervise.FormatSelfTest(supervise.RunSelfTest(sandbox, spec))
	fmt.Print(report)
	if !ok {
		return fmt.Errorf("confinement is NOT fully in force — see above")
	}
	fmt.Println("\nEvery conclusive probe was denied: tier-B confinement is in force for these paths.")
	fmt.Println("Note this is a deny-list, not general confinement — paths not listed are not restricted.")
	return nil
}

// startSuperviseConnection opens the control-plane connection that receives
// actor_config pushes. Returns a stop function.
//
// Deliberately non-fatal in a way startIntercept's provisioning is not: a
// supervisor that cannot reach the control plane is still fully governed by the
// artefacts it already holds, because those were verified offline against the
// pinned anchor. Making an unreachable control plane stop a working supervisor
// would put availability of the console on the critical path of a decision that
// was specifically designed not to need it.
func startSuperviseConnection(
	ctx context.Context,
	cfg *config.Sensor,
	logger *slog.Logger,
	store *intercept.Store,
	anchor *grant.Anchor,
	settings *supervise.Settings,
) (func(), <-chan struct{}, error) {
	sv := cfg.Supervise

	id, err := identity.LoadOrCreate(cfg.IdentityPath)
	if err != nil {
		return nil, nil, fmt.Errorf("supervise: loading this host's identity: %w", err)
	}
	hostname, _ := os.Hostname()
	name := cfg.DeviceName
	if name == "" {
		name = hostname
	}

	// Closed once, when the first push has been fully handled. See
	// awaitFirstConfig for why a launch waits on it.
	firstConfig := &latch{ch: make(chan struct{})}

	localCfg := supervise.Local{
		Mode:                string(settings.Mode()),
		Sandbox:             sv.Sandbox,
		MaxStatusAgeSeconds: sv.MaxStatusAgeSeconds,
	}

	client := vconn.NewClientConn(vconn.ClientConfig{
		CollectorURL: sv.ControlPlaneURL,
		Identity:     id,
		Name:         name,
		Kind:         "harness",
		// **No CapabilityStatePath.** vconn persists the capability list that
		// arrives with `cert_issued` — an unsigned, locally cached array the
		// sensor role uses to gate its own polling. For this role it is a second
		// answer to "what may this host do", and it disagrees with the first: it
		// showed seven capabilities on a host whose packcert granted none, which
		// is exactly the kind of contradiction that makes an operator trust the
		// wrong number.
		//
		// The certificate is the only source of truth here. Every decision goes
		// through authz.Resolve over the verified grant, and nothing in this role
		// reads a capability from anywhere else.
		//
		// What this role asks for. Declared rather than assumed: an admin
		// approving the registration sees exactly what it intends to gate.
		RequestedCapabilities: supervise.EnforcedCapabilities(),
		Logger:                logger,
		OnActorConfig: func(payload vconn.ActorConfigPayload) {
			// Signalled on every path out of this handler, including the ones
			// that refuse the push: what a launch is waiting for is the control
			// plane having *had its say*, not the push having been good. A
			// rejected or empty push is an answer, and waiting past it would
			// turn a signature failure into a startup hang.
			defer firstConfig.arrived()

			// The signed half first: written to the same paths a hand-provisioned
			// deployment uses, so one verification path serves both.
			if err := supervise.WriteArtefacts(payload, sv.GrantPath, sv.RuleSetPath); err != nil {
				logger.Warn("supervise: could not persist pushed artefacts; keeping the current policy", "err", err)
				return
			}
			if err := store.Reload(); err != nil {
				// A failed reload leaves the previously verified state in force,
				// which is the safe direction — a corrupt or forged push must not
				// widen access by dropping the rules half.
				logger.Warn("supervise: pushed artefacts failed verification; continuing on the last verified state", "err", err)
			} else {
				// Say what arrived, not merely that something did. A push
				// carrying no grant is the common case while an Actor is approved
				// but has no packcert yet, and logging "policy updated" for it
				// tells an operator they are provisioned when they authorize
				// nothing at all.
				logger.Info("supervise: configuration received from the control plane",
					"grant", present(payload.GrantToken),
					"ruleSet", present(payload.RuleSetToken),
					"summary", store.Summary())
				if !store.Provisioned() {
					logger.Warn("supervise: the control plane sent no capability grant — this host still authorizes nothing. " +
						"Its certificate must be packcert-format: issue one from Certificates → Issue. " +
						"Approving a registration produces a challenger-format certificate, which carries no signed " +
						"capability metadata and so cannot back an offline decision.")
				}
			}

			// Settings. A signed kindConfig is authoritative in both directions;
			// only an unsigned one is ratcheted. See internal/supervise/push.go.
			var applied supervise.Applied
			if payload.KindConfigToken != nil && *payload.KindConfigToken != "" {
				cfg, verr := supervise.VerifiedConfig(anchor, *payload.KindConfigToken)
				if verr != nil {
					// Never fall back to the unsigned copy: the two are
					// indistinguishable in content, so accepting it after a
					// signature failure would make forging a config no harder
					// than corrupting one byte of the real one.
					logger.Warn("supervise: REFUSED a pushed configuration whose signature did not verify", "err", verr)
					return
				}
				applied = supervise.ApplyVerifiedConfig(localCfg, cfg)
			} else {
				var aerr error
				applied, aerr = supervise.ApplyPushedConfig(localCfg, payload.KindConfig)
				if aerr != nil {
					logger.Warn("supervise: pushed kindConfig ignored", "err", aerr)
					return
				}
				if len(applied.Refused) > 0 || len(applied.Tightened) > 0 {
					logger.Warn("supervise: this control plane sends no signed kindConfig, so settings can only be tightened — upgrade it to relax a host from the console")
				}
			}
			// Applied now, then reported — split by what actually takes effect,
			// because telling an operator to restart for a change that already
			// applied trains them to ignore the line that matters.
			if live := settings.Apply(applied.PushedMode(), applied.PushedMaxStatusAge()); len(live) > 0 {
				logger.Info("supervise: settings changed by the control plane, in force from the next tool call", "settings", live)
			}
			if pending := applied.NeedsRestart(); len(pending) > 0 {
				// OS confinement is applied to the harness process at exec time
				// and a running process cannot be re-confined. Same for the
				// kernel-enforced half of a file deny rule, which is compiled
				// into that same profile — the rule itself is already live at the
				// tool boundary, only its sandbox half waits.
				logger.Warn("supervise: OS confinement cannot change while the harness is running; these apply on the next launch",
					"settings", pending)
			}
			if len(applied.Tightened) > 0 {
				// Not yet applied to the running decider: mode and sandbox are
				// fixed at launch (the sandbox wraps the harness process, which
				// is already running). Reported so an operator knows a restart
				// would change behaviour, rather than believing a console change
				// took effect when it did not.
				logger.Warn("supervise: the control plane asks for stricter settings than this host is running; restart to apply",
					"settings", applied.Tightened)
			}
			if len(applied.Refused) > 0 {
				// The load-bearing log line of this whole path. An unsigned push
				// that tried to weaken enforcement is either a misconfiguration
				// or an attack, and either way nobody may learn about it from the
				// absence of an effect.
				logger.Warn("supervise: REFUSED a pushed configuration that would weaken enforcement — kindConfig is unsigned and may only tighten",
					"refused", applied.Refused)
			}
		},
	})

	connCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		client.Run(connCtx)
	}()
	logger.Info("supervise: connecting to the control plane", "url", sv.ControlPlaneURL, "did", id.DID())

	return func() {
		cancel()
		<-done
	}, firstConfig.ch, nil
}

// latch is a one-shot broadcast: many waiters, one signaller, signalled from a
// callback that may run more than once.
type latch struct {
	ch   chan struct{}
	once sync.Once
}

func (l *latch) arrived() { l.once.Do(func() { close(l.ch) }) }

// awaitFirstConfig blocks until the control plane has delivered its first
// actor_config, the timeout elapses, or the context is cancelled.
//
// Bounded and non-fatal in every direction. A host with no certificate yet
// receives no push at all, an unreachable control plane delivers nothing, and
// neither may stop a supervisor whose on-disk artefacts were already verified
// against the pinned anchor. The wait buys one specific thing: that the tier-B
// profile compiled immediately after this call describes current policy rather
// than the previous session's.
//
// A timeout is reported as what it costs, not as a generic warning — the
// difference between "tier A is current, tier B may be one policy behind" and
// "nothing is in force" is the whole reason this is a warning and not an error.
func awaitFirstConfig(ctx context.Context, logger *slog.Logger, firstConfig <-chan struct{}, timeout time.Duration) {
	if firstConfig == nil || timeout <= 0 {
		return
	}
	logger.Info("supervise: waiting for the control plane's first configuration push before launching", "timeout", timeout)
	select {
	case <-firstConfig:
		logger.Info("supervise: control-plane configuration synced; compiling confinement from current policy")
	case <-ctx.Done():
	case <-time.After(timeout):
		logger.Warn("supervise: no configuration arrived within the startup sync timeout — launching on the artefacts already on disk. "+
			"Tier A still picks up a later push on the next tool call, but OS confinement is fixed at launch, so a rule that arrives "+
			"after this point is enforced at the tool boundary and not by the kernel until the next launch",
			"timeout", timeout)
	}
}

// present renders whether an optional pushed artefact was included, for the log
// line an operator reads to tell "provisioned" from "connected".
func present(token *string) string {
	if token != nil && *token != "" {
		return "yes"
	}
	return "no"
}
