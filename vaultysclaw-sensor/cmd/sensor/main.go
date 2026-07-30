// Command sensor is the vaultysclaw-sensor endpoint daemon: it polls local
// process/network state, classifies likely AI usage/agents, and reports
// signed metadata-only telemetry to a collector. See the package CLAUDE.md
// / docs/vaultysclaw-integration.md for the broader design.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"runtime"
	"sync"
	"syscall"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/config"
	"github.com/vaultys/vaultysclaw-sensor/internal/correlation"
	"github.com/vaultys/vaultysclaw-sensor/internal/identity"
	"github.com/vaultys/vaultysclaw-sensor/internal/platformselect"
	"github.com/vaultys/vaultysclaw-sensor/internal/state"
	"github.com/vaultys/vaultysclaw-sensor/internal/telemetry"
	"github.com/vaultys/vaultysclaw-sensor/internal/vconn"
)

func main() {
	if len(os.Args) < 2 || os.Args[1] != "run" {
		fmt.Fprintln(os.Stderr, "usage: vaultysclaw-sensor run [--config path]")
		os.Exit(2)
	}

	fs := flag.NewFlagSet("run", flag.ExitOnError)
	configPath := fs.String("config", defaultConfigPath(), "path to config file (optional; defaults are used for anything missing)")
	_ = fs.Parse(os.Args[2:])

	if err := run(*configPath); err != nil {
		fmt.Fprintln(os.Stderr, "vaultysclaw-sensor:", err)
		os.Exit(1)
	}
}

func defaultConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return home + "/.vaultysclaw-sensor/config.yaml"
}

func run(configPath string) error {
	cfg, err := config.LoadSensorConfig(configPath)
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	level := slog.LevelInfo
	if cfg.Debug {
		level = slog.LevelDebug
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))
	slog.SetDefault(logger)

	id, err := identity.LoadOrCreate(cfg.IdentityPath)
	if err != nil {
		return fmt.Errorf("loading device identity: %w", err)
	}
	logger.Info("sensor: identity ready", "did", id.DID())

	hostname, _ := os.Hostname()
	deviceName := cfg.DeviceName
	if deviceName == "" {
		deviceName = hostname
	}
	telemetryDevice := telemetry.Device{ID: id.DID(), Hostname: hostname, OS: runtime.GOOS}
	corrDevice := correlation.DeviceInfo{ID: id.DID(), Hostname: hostname, OS: runtime.GOOS}

	procCollector, netCollector := platformselect.New()
	resolver := collector.NewResolverCache(2 * time.Second)
	store := state.NewStore()

	var client *vconn.ClientConn
	if cfg.TelemetryEnabled {
		client = vconn.NewClientConn(vconn.ClientConfig{
			CollectorURL: cfg.CollectorURL,
			Identity:     id,
			Name:         deviceName,
			Logger:       logger,
		})
	} else {
		logger.Warn("sensor: telemetry disabled by config; running in local-detection-only mode")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var wg sync.WaitGroup
	if client != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			client.Run(ctx)
		}()
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		runPollLoop(ctx, cfg, procCollector, netCollector, resolver, store, client, corrDevice, telemetryDevice, logger)
	}()

	logger.Info("sensor: started", "scanIntervalSeconds", cfg.ScanIntervalSeconds, "os", runtime.GOOS, "device", deviceName)
	<-ctx.Done()
	logger.Info("sensor: shutting down")
	wg.Wait()
	logger.Info("sensor: stopped")
	return nil
}
