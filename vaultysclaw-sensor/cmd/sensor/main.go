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
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/VaultysClaw/sdk-go/telemetry"
	"github.com/vaultys/VaultysClaw/sdk-go/vconn"
	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/config"
	"github.com/vaultys/vaultysclaw-sensor/internal/correlation"
	"github.com/vaultys/vaultysclaw-sensor/internal/platformselect"
	"github.com/vaultys/vaultysclaw-sensor/internal/state"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}

	switch os.Args[1] {
	case "run":
		fs := flag.NewFlagSet("run", flag.ExitOnError)
		configPath := fs.String("config", defaultConfigPath(), "path to config file (optional; defaults are used for anything missing)")
		_ = fs.Parse(os.Args[2:])
		fail(run(*configPath))

	case "supervise":
		fs := flag.NewFlagSet("supervise", flag.ExitOnError)
		configPath := fs.String("config", defaultConfigPath(), "path to config file")
		_ = fs.Parse(os.Args[2:])
		fail(runSuperviseCommand(*configPath, fs.Args()))

	case "report":
		fs := flag.NewFlagSet("report", flag.ExitOnError)
		configPath := fs.String("config", defaultConfigPath(), "path to config file")
		maxResources := fs.Int("resources", 20, "how many distinct resources to list per capability (0 = all)")
		_ = fs.Parse(os.Args[2:])
		fail(runSuperviseReport(*configPath, *maxResources))

	case "sandbox-check":
		fs := flag.NewFlagSet("sandbox-check", flag.ExitOnError)
		configPath := fs.String("config", defaultConfigPath(), "path to config file")
		_ = fs.Parse(os.Args[2:])
		fail(runSandboxCheck(*configPath))

	case "catalog":
		fs := flag.NewFlagSet("catalog", flag.ExitOnError)
		configPath := fs.String("config", defaultConfigPath(), "path to config file")
		_ = fs.Parse(os.Args[2:])
		switch fs.Arg(0) {
		case "dump":
			fail(runCatalogDump(*configPath))
		case "check", "":
			fail(runCatalogCheck(*configPath))
		default:
			usage()
		}

	case "hook":
		// Executed by the harness once per tool call. Kept out of the config
		// path entirely: it must not read, parse or validate anything the
		// resident daemon has already read.
		fs := flag.NewFlagSet("hook", flag.ExitOnError)
		socket := fs.String("socket", os.Getenv("VAULTYSCLAW_SUPERVISE_SOCKET"), "path to the supervisor's decision socket")
		_ = fs.Parse(os.Args[2:])
		fail(runHook(*socket))

	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage:")
	fmt.Fprintln(os.Stderr, "  vaultysclaw-sensor run [--config path]                 observe, and enforce if the intercept role is enabled")
	fmt.Fprintln(os.Stderr, "  vaultysclaw-sensor supervise [--config path] -- claude  launch a coding harness under tool-call governance")
	fmt.Fprintln(os.Stderr, "  vaultysclaw-sensor report [--config path]              what the supervised sessions did, and the scope they would need")
	fmt.Fprintln(os.Stderr, "  vaultysclaw-sensor sandbox-check [--config path]       prove OS confinement is really in force for your floor")
	fmt.Fprintln(os.Stderr, "  vaultysclaw-sensor catalog check [--config path]       validate the detection rule catalog and show what it changes")
	fmt.Fprintln(os.Stderr, "  vaultysclaw-sensor catalog dump [--config path]        print the effective rule set, ready to edit and save back")
	fmt.Fprintln(os.Stderr, "  vaultysclaw-sensor hook --socket path                  the per-tool-call decision shim (run by the harness, not by hand)")
	os.Exit(2)
}

func fail(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "vaultysclaw-sensor:", err)
		os.Exit(1)
	}
}

// runSuperviseCommand loads config and hands off to runSupervise, with its own
// signal-scoped context so ^C reaches the harness and then shuts the daemon down.
func runSuperviseCommand(configPath string, command []string) error {
	cfg, err := config.LoadSensorConfig(configPath)
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}
	level := slog.LevelInfo
	if cfg.Debug {
		level = slog.LevelDebug
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return runSupervise(ctx, cfg, logger, command)
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

	// The detection rule catalog is a separate, hot-reloadable file: a new
	// harness ships far more often than a sensor's operational settings change,
	// and a fleet of laptop daemons should not need restarting to see it.
	catalog, err := config.NewCatalogWatcher(cfg, logger)
	if err != nil {
		return fmt.Errorf("loading detection catalog: %w", err)
	}
	logger.Info("sensor: detection catalog loaded", catalog.Summary()...)
	if keys := config.RuleKeysInConfig(configPath); len(keys) > 0 {
		logger.Warn("sensor: detection rules found in config.yaml — these REPLACE the built-in catalog rather than extending it; move them to the catalog file to merge instead",
			"keys", keys, "catalog", catalog.Path())
	}

	procCollector, netCollector := platformselect.New()
	resolver := collector.NewResolverCache(2 * time.Second)
	// Forward-resolves the provider catalog so connections the OS reports as a
	// bare IP can still be attributed. Without it, provider matching silently
	// fails for every CDN-fronted AI API — see collector.ProviderIndex.
	providerIndex := collector.NewProviderIndex(catalog.Current().Providers, 15*time.Minute, 2*time.Second, logger)
	store := state.NewStore()

	var client *vconn.ClientConn
	if cfg.TelemetryEnabled {
		// Lives alongside the identity secret — both are per-device, private state.
		capStatePath := filepath.Join(filepath.Dir(cfg.IdentityPath), "capabilities.json")
		client = vconn.NewClientConn(vconn.ClientConfig{
			CollectorURL: cfg.CollectorURL,
			Identity:     id,
			Name:         deviceName,
			// Declared explicitly now that the connection lives in the shared
			// SDK: it defaults to "openclaw" there, and neither the kind nor
			// the capability set a sensor needs is something a general-purpose
			// SDK should assume on a caller's behalf.
			Kind:                  "sensor",
			RequestedCapabilities: []string{"process_read"},
			Logger:                logger,
			CapabilityStatePath:   capStatePath,
		})
	} else {
		logger.Warn("sensor: telemetry disabled by config; running in local-detection-only mode")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// The intercept role starts before the poll loop and fails the process if it
	// cannot start safely: an operator who enabled enforcement must not end up
	// with a running observe-only sensor that looks identical (§3.2).
	if cfg.Intercept.Enabled {
		stopIntercept, err := startIntercept(ctx, cfg, logger)
		if err != nil {
			return fmt.Errorf("starting intercept role: %w", err)
		}
		defer stopIntercept()
	} else {
		logger.Debug("sensor: intercept role disabled; observe-only")
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		providerIndex.Run(ctx)
	}()

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
		runPollLoop(ctx, catalog, procCollector, netCollector, resolver, providerIndex, store, client, corrDevice, telemetryDevice, logger)
	}()

	logger.Info("sensor: started", "scanIntervalSeconds", cfg.ScanIntervalSeconds, "os", runtime.GOOS, "device", deviceName)
	<-ctx.Done()
	logger.Info("sensor: shutting down")
	wg.Wait()
	logger.Info("sensor: stopped")
	return nil
}
