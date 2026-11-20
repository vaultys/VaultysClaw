package agent

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/VaultysClaw/sdk-go/toolgate"
	"github.com/vaultys/VaultysClaw/sdk-go/vconn"

	"github.com/vaultys/vaultysclaw-hooks/internal/coverage"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// RequestedCapabilities is what this Actor asks for at registration: the
// capabilities toolgate actually gates, so an admin approving it sees exactly
// what it intends to decide.
func RequestedCapabilities() []string {
	return []string{
		string(toolgate.CapFileRead), string(toolgate.CapFileWrite), string(toolgate.CapCodeExecution),
		string(toolgate.CapInternetAccess), string(toolgate.CapKnowledgeSearch), string(toolgate.CapAPICall),
		string(toolgate.CapAgentComm),
	}
}

// Options configures Run.
type Options struct {
	Scope   state.Scope
	Paths   state.Paths
	Version string
	Logger  *slog.Logger
	// FlushInterval is how often the spool is drained. Defaults to 10s.
	FlushInterval time.Duration
	// Coverage, when set, computes the host's coverage report, sent as
	// hook_coverage when it changes and at least every coverageEvery.
	Coverage func() coverage.Report
}

// Run connects and serves until ctx is cancelled, reconnecting on its own.
func Run(ctx context.Context, o Options) error {
	log := o.Logger
	if log == nil {
		log = slog.Default()
	}
	coords, err := LoadCoordinates(o.Paths)
	if err != nil {
		return err
	}
	anchor, err := grant.LoadAnchor(o.Paths.Anchor)
	if errors.Is(err, grant.ErrNoAnchor) {
		return fmt.Errorf("agent: no control-plane anchor at %s — re-run `vaultysclaw-hooks enroll`", o.Paths.Anchor)
	}
	if err != nil {
		return err
	}
	id, err := identity.LoadOrCreate(o.Paths.Identity)
	if err != nil {
		return err
	}
	interval := o.FlushInterval
	if interval <= 0 {
		interval = 10 * time.Second
	}

	outbox := &Outbox{Dir: o.Paths.SpoolDir, MaxBatch: 200, Grace: 2 * time.Second, Logger: log}
	status := &StatusRefresher{Scope: o.Scope, Paths: o.Paths, Anchor: anchor, Identity: id, Logger: log}
	cov := &CoverageReporter{Compute: o.Coverage}
	client := vconn.NewClientConn(vconn.ClientConfig{
		CollectorURL: coords.URL,
		Identity:     id,
		Name:         coords.Name,
		Version:      o.Version,
		// The same kind as vaultysclaw-sensor's supervise role: the control
		// plane's harness panel, kindConfig schema and signed push serve both.
		Kind:                  "harness",
		RequestedCapabilities: RequestedCapabilities(),
		BatchInterval:         interval,
		Logger:                log,
		OnActorConfig: func(payload vconn.ActorConfigPayload) {
			rep, err := ApplyPush(o.Scope, o.Paths, anchor, payload, time.Now())
			if err != nil {
				log.Warn("agent: push refused; the last verified policy stays in force", "err", err)
				return
			}
			log.Info("agent: configuration received",
				"grant", rep.GrantWritten, "ruleSet", rep.RulesWritten,
				"signedConfig", rep.SignedConfig, "changed", rep.Changed)
			if len(rep.Refused) > 0 {
				log.Warn("agent: parts of the push were refused", "refused", rep.Refused)
			}
			if payload.GrantToken == nil && !fileExists(o.Paths.Grant) {
				log.Warn("agent: the control plane sent no capability grant — this host authorizes nothing yet. " +
					"Issue it a packcert certificate (Certificates → Issue); approving the registration alone is not enough.")
			}
		},
		// A status request rides along with each tick's audit batch. It is
		// not durable and needs no ack: a lost request times out and is re-sent.
		Outbox: func() ([]vconn.Envelope, func()) {
			msgs, ack := outbox.Next()
			covMsgs, covAck := cov.Next()
			out := append(append(status.Next(), covMsgs...), msgs...)
			return out, func() {
				if covAck != nil {
					covAck()
				}
				if ack != nil {
					ack()
				}
			}
		},
		OnCertStatusResponse: func(token string) {
			if err := status.Accept(token); err != nil {
				log.Warn("agent: status response not applied", "err", err)
			}
		},
	})

	log.Info("agent: starting",
		"did", id.DID(), "controlPlane", coords.URL, "anchor", anchor.DID(),
		"state", o.Paths.Dir, "spool", o.Paths.SpoolDir)
	client.Run(ctx)
	return nil
}
