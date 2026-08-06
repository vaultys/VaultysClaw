package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/config"
	"github.com/vaultys/vaultysclaw-sensor/internal/grant"
	"github.com/vaultys/vaultysclaw-sensor/internal/intercept"
)

// reloadInterval is how often the store re-reads its provisioned artefacts, so a
// freshly written grant or rule set takes effect without a restart. Once §12's
// actor_config push exists this becomes a fallback rather than the only path.
const reloadInterval = 30 * time.Second

// startIntercept brings up the tier-1 CONNECT proxy
// (docs/PROXY_ARCHITECTURE.md §8). Returns a stop function, or an error if the
// role cannot be started safely.
//
// Every failure here is fatal rather than degraded on purpose: a proxy running
// without a verified grant, or listening without knowing which control plane to
// trust, is indistinguishable at a glance from one that is working, and an
// operator who thinks they are enforcing something must not be quietly wrong
// (§3.2).
func startIntercept(ctx context.Context, cfg *config.Sensor, logger *slog.Logger) (func(), error) {
	ic := cfg.Intercept

	anchor, err := resolveAnchor(ic)
	if err != nil {
		return nil, err
	}
	logger.Info("intercept: control-plane anchor pinned", "did", anchor.DID(), "path", ic.AnchorPath)

	// `explicit` mode has no attribution source: every caller was pointed here
	// deliberately, so there is nothing to resolve (§5.2.3). Passing false makes
	// the store refuse a rule set whose subject-scoped rules could never match.
	store, err := intercept.NewStore(intercept.StoreOptions{
		Anchor:               anchor,
		GrantPath:            ic.GrantPath,
		RuleSetPath:          ic.RuleSetPath,
		AttributionAvailable: false,
	})
	if err != nil {
		return nil, err
	}
	logger.Info("intercept: policy loaded", "summary", store.Summary())

	spool, err := intercept.NewFileSpool(ic.SpoolPath, intercept.SpoolOptions{})
	if err != nil {
		return nil, err
	}

	maxStatusAge := time.Duration(ic.MaxStatusAgeSeconds) * time.Second
	if ic.MaxStatusAgeSeconds < 0 {
		// Unbounded. Loud, because it means a revoked certificate keeps working
		// for as long as this host stays unrefreshed (§8.2).
		logger.Warn("intercept: maxStatusAgeSeconds is negative — certificate status will back decisions indefinitely without a refresh")
	} else if ic.MaxStatusAgeSeconds == 0 && ic.FailClosed {
		// The strictest setting, and offline it denies everything. Say so at
		// startup rather than letting the operator discover it from the spool.
		logger.Warn("intercept: maxStatusAgeSeconds is 0 with failClosed — every governed request will be denied, since an offline decider cannot perform the live status check that setting demands")
	}

	proxy := &intercept.Proxy{
		ConfigFor:   store.ConfigFor(maxStatusAge, ic.FailClosed),
		Recorder:    spool,
		IdleTimeout: time.Duration(ic.IdleTimeoutSeconds) * time.Second,
	}
	if err := proxy.Listen(ic.ListenAddr); err != nil {
		_ = spool.Close()
		return nil, err
	}

	go func() {
		if err := proxy.Serve(); err != nil {
			logger.Error("intercept: proxy stopped", "err", err)
		}
	}()

	// Periodic reload, so provisioning a new grant or rule set does not require
	// restarting the listener and dropping live tunnels.
	reloadDone := make(chan struct{})
	go func() {
		defer close(reloadDone)
		t := time.NewTicker(reloadInterval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if err := store.Reload(); err != nil {
					// A failed reload leaves the previous verified state in
					// force, so this is a warning, not a shutdown.
					logger.Warn("intercept: reloading policy failed; continuing on the last verified state", "err", err)
					continue
				}
				logger.Debug("intercept: policy reloaded", "summary", store.Summary())
			}
		}
	}()

	logger.Info("intercept: listening",
		"addr", proxy.Addr().String(),
		"mode", ic.Mode,
		"failClosed", ic.FailClosed,
		"maxStatusAgeSeconds", ic.MaxStatusAgeSeconds,
		"spool", ic.SpoolPath,
	)

	return func() {
		if err := proxy.Close(); err != nil {
			logger.Warn("intercept: closing proxy", "err", err)
		}
		<-reloadDone
		if stats := spool.Stats(); stats.Dropped > 0 {
			// A measured gap in the audit trail is reported, never inferred from
			// a suspiciously short spool file (§5.2.1).
			logger.Warn("intercept: audit events were dropped", "written", stats.Written, "dropped", stats.Dropped)
		}
		if err := spool.Close(); err != nil {
			logger.Warn("intercept: closing spool", "err", err)
		}
	}, nil
}

// resolveAnchor establishes which control plane this host trusts.
//
// Two routes, both of which avoid a trust-on-first-use window: an identity
// provisioned out of band via intercept.controlPlaneId, or one already pinned by
// a previous run. Pinning from a live handshake instead is deliberately not
// available here — it would mean deriving the verification key from the same
// party whose signatures it checks, on the very first run, and the enforcement
// role is the wrong place to accept that.
func resolveAnchor(ic config.Intercept) (*grant.Anchor, error) {
	if ic.ControlPlaneID != "" {
		anchor, err := grant.PinFromConfig(ic.AnchorPath, ic.ControlPlaneID)
		if err != nil {
			return nil, fmt.Errorf("intercept: pinning the configured control-plane identity: %w", err)
		}
		return anchor, nil
	}

	anchor, err := grant.LoadAnchor(ic.AnchorPath)
	if errors.Is(err, grant.ErrNoAnchor) {
		return nil, fmt.Errorf(
			"intercept: no control-plane identity pinned at %s — set intercept.controlPlaneId "+
				"(base64 of the control plane's VaultysId) so this host knows whose certificates to trust",
			ic.AnchorPath,
		)
	}
	if err != nil {
		return nil, err
	}
	return anchor, nil
}
