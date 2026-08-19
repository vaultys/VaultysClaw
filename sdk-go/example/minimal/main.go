// A minimal VaultysClaw Actor.
//
// Connects to the rebuilt control plane, registers, waits out admin approval,
// receives a capability certificate, and gates its own work on what it was
// actually granted — which may be less than it asked for.
//
//	go run ./example/minimal
//
// Env: VC_CONTROL_PLANE_URL (default http://localhost:3001), VC_ACTOR_NAME.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/VaultysClaw/sdk-go/vconn"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	url := envOr("VC_CONTROL_PLANE_URL", "http://localhost:3001")
	name := envOr("VC_ACTOR_NAME", "example-actor")

	home, err := os.UserHomeDir()
	if err != nil {
		logger.Error("resolving home directory", "error", err)
		os.Exit(1)
	}
	stateDir := filepath.Join(home, ".vaultysclaw", "example-actor")

	// The identity file is created on first run and reused forever after. It is
	// this Actor's whole claim to its DID — losing it means registering as a
	// brand new Actor that must be approved again.
	id, err := identity.LoadOrCreate(filepath.Join(stateDir, "identity.secret"))
	if err != nil {
		logger.Error("loading identity", "error", err)
		os.Exit(1)
	}
	logger.Info("identity ready", "did", id.DID())

	conn := vconn.NewClientConn(vconn.ClientConfig{
		CollectorURL: url,
		Identity:     id,
		Name:         name,
		Kind:         "openclaw",
		// A request, not a declaration — an admin may approve fewer of these,
		// and the loop below reflects what was actually granted.
		RequestedCapabilities: []string{"internet_access", "file_access"},
		CapabilityStatePath:   filepath.Join(stateDir, "capabilities.json"),
		Logger:                logger,
	})

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go conn.Run(ctx)

	logger.Info("connecting — approve this Actor in the admin console", "url", url, "name", name)

	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("shutting down")
			return
		case <-ticker.C:
			// The whole point of the SDK: decide locally, from a certificate
			// the control plane signed, with no round trip.
			net := conn.HasCapability("internet_access")
			file := conn.HasCapability("file_access")

			switch {
			case !net && !file:
				logger.Info("no capabilities granted yet — doing nothing, correctly")
			default:
				logger.Info("granted", "internet_access", net, "file_access", file)
			}
		}
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
