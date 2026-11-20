package supervise

import (
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
)

// Shared by the daemon, report and sandbox tests. The decision tests that
// originally defined these moved to sdk-go/toolgate with the code they test.

var now = time.Date(2026, 9, 3, 12, 0, 0, 0, time.UTC)

// cert builds a usable certificate scoped to pattern (empty = unscoped).
func cert(id string, pattern string, caps ...authz.Capability) authz.Certificate {
	c := authz.Certificate{
		ID:           id,
		AgentDID:     "did:vaultys:test",
		Capabilities: caps,
		Status:       authz.StatusActive,
		IssuedAt:     now.Add(-time.Hour).UnixMilli(),
	}
	if pattern != "" {
		c.Scope = &authz.CertScope{ResourcePattern: pattern}
	}
	return c
}

func baseConfig(mode Mode, floor *Floor, certs ...authz.Certificate) Config {
	return Config{
		Mode:         mode,
		Certs:        certs,
		Floor:        floor,
		MaxStatusAge: time.Hour,
		SyncedAt:     now.Add(-time.Minute),
		FailClosed:   true,
	}
}
