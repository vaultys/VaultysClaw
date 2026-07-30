package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/config"
	"github.com/vaultys/vaultysclaw-sensor/internal/correlation"
	"github.com/vaultys/vaultysclaw-sensor/internal/detector"
	"github.com/vaultys/vaultysclaw-sensor/internal/state"
	"github.com/vaultys/vaultysclaw-sensor/internal/telemetry"
	"github.com/vaultys/vaultysclaw-sensor/internal/vconn"
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

	poll := func() {
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
