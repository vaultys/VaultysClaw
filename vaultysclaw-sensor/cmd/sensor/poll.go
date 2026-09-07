package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/VaultysClaw/sdk-go/telemetry"
	"github.com/vaultys/VaultysClaw/sdk-go/vconn"
	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/config"
	"github.com/vaultys/vaultysclaw-sensor/internal/correlation"
	"github.com/vaultys/vaultysclaw-sensor/internal/detector"
	"github.com/vaultys/vaultysclaw-sensor/internal/state"
)

// runPollLoop is the sensor's core pipeline: collect -> correlate ->
// classify -> reconcile -> enqueue, once immediately and then on every
// scan interval until ctx is cancelled.
func runPollLoop(
	ctx context.Context,
	cfg *config.Sensor,
	procCollector collector.ProcessCollector,
	netCollector collector.NetworkCollector,
	resolver *collector.ResolverCache,
	store *state.Store,
	client *vconn.ClientConn,
	device correlation.DeviceInfo,
	telemetryDevice telemetry.Device,
	logger *slog.Logger,
) {
	interval := time.Duration(cfg.ScanIntervalSeconds) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	var lastAgentIdentityDID string // only for the change-log below, not correctness
	refreshAgentIdentity := func() {
		if cfg.AgentIdentityPath == "" {
			return
		}
		did, err := identity.LoadDID(cfg.AgentIdentityPath)
		if err != nil {
			did = "" // not found/unreadable right now — not fatal, just no evidence to attach this cycle
		}
		if did != lastAgentIdentityDID {
			if did != "" {
				logger.Info("sensor: local agent identity found — will attach as evidence on matching workloads", "agentDid", did)
			} else {
				logger.Warn("sensor: local agent identity no longer readable", "path", cfg.AgentIdentityPath)
			}
			lastAgentIdentityDID = did
		}
		store.SetAgentIdentityDID(did)
	}

	poll := func() {
		refreshAgentIdentity()
		// Gated on an actually-delivered process_read certificate (docs/CERTIFICATE_WEB_OF_TRUST.md
		// §3.2b) whenever we're connected to a control plane at all — read nothing, not just "don't
		// report it", until granted. Local-detection-only mode (client == nil, no control plane
		// configured) has no grantor to wait on, so it keeps its original unrestricted behavior.
		if client != nil && !client.HasCapability("process_read") {
			logger.Debug("sensor: skipping poll cycle — process_read capability not yet granted")
			return
		}

		pctx, cancel := context.WithTimeout(ctx, interval)
		defer cancel()

		processes, err := procCollector.Processes(pctx)
		if err != nil {
			logger.Warn("sensor: process collection failed", "error", err)
			return
		}
		connections, err := netCollector.Connections(pctx)
		if err != nil {
			// Degrade gracefully: still classify on process-only signals
			// (local runtimes/MCP/agent-framework naming) rather than
			// skipping the whole cycle over a network-collector error.
			logger.Warn("sensor: network collection failed, continuing without it", "error", err)
			connections = nil
		}

		observations := correlation.Build(device, processes, connections, cfg)

		now := time.Now()
		var current []state.CurrentObservation
		for _, obs := range observations {
			d := detector.Classify(obs, cfg, resolver)
			if d.AIConfidence == 0 && d.AgentConfidence == 0 {
				continue // nothing worth tracking
			}
			fp := state.ComputeFingerprint(obs.Process.Executable, obs.Process.Command, obs.Process.User, d.Provider, device.ID)
			current = append(current, state.CurrentObservation{Fingerprint: fp, Process: obs.Process, Detection: d})
		}

		events := store.Reconcile(now, telemetryDevice, current)
		for _, evt := range events {
			logger.Debug("sensor: event", "type", evt.Type, "fingerprint", evt.Workload.Fingerprint, "provider", evt.Workload.Provider)
			if client != nil {
				client.Enqueue(evt)
			}
		}
		if len(events) > 0 {
			logger.Info("sensor: poll cycle", "candidates", len(observations), "events", len(events))
		}
	}

	poll() // don't wait a full interval before the first classification
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			poll()
		}
	}
}
