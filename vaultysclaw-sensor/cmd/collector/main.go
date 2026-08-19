// Command collector is the standalone reference ingestion service that
// vaultysclaw-sensor reports to in this pass — a demo-grade stand-in for
// real ingestion, not a hardened multi-tenant backend. See
// docs/vaultysclaw-integration.md for how this maps onto a future
// VaultysClaw control-plane integration.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/vaultysclaw-sensor/internal/config"
	"github.com/vaultys/vaultysclaw-sensor/internal/ingest"
	"github.com/vaultys/vaultysclaw-sensor/internal/vconn"
)

func main() {
	if len(os.Args) < 2 || os.Args[1] != "run" {
		fmt.Fprintln(os.Stderr, "usage: vaultysclaw-collector run [--config path]")
		os.Exit(2)
	}

	fs := flag.NewFlagSet("run", flag.ExitOnError)
	configPath := fs.String("config", defaultConfigPath(), "path to config file (optional; defaults are used for anything missing)")
	_ = fs.Parse(os.Args[2:])

	if err := run(*configPath); err != nil {
		fmt.Fprintln(os.Stderr, "vaultysclaw-collector:", err)
		os.Exit(1)
	}
}

func defaultConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return home + "/.vaultysclaw-collector/config.yaml"
}

func run(configPath string) error {
	cfg, err := config.LoadCollectorConfig(configPath)
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
		return fmt.Errorf("loading collector identity: %w", err)
	}
	logger.Info("collector: identity ready", "did", id.DID())

	store := ingest.NewStore(cfg.SnapshotPath)
	vconnServer := vconn.NewServer(store, id, logger)
	server := ingest.NewServer(store, vconnServer, vconnServer, vconnServer.HandleWS, logger)

	httpServer := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		store.StartSnapshotLoop(ctx, time.Duration(cfg.SnapshotIntervalSeconds)*time.Second)
	}()

	serveErr := make(chan error, 1)
	go func() {
		logger.Info("collector: listening", "addr", cfg.ListenAddr, "snapshotPath", cfg.SnapshotPath)
		serveErr <- httpServer.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		logger.Info("collector: shutting down")
	case err := <-serveErr:
		if err != nil && err != http.ErrServerClosed {
			logger.Error("collector: server error", "error", err)
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Warn("collector: graceful shutdown failed", "error", err)
	}

	stop() // ensure the snapshot loop's context is done too, so it takes a final snapshot and exits
	wg.Wait()
	logger.Info("collector: stopped")
	return nil
}
