package vconn

import (
	"io"
	"log/slog"
	"testing"

	"github.com/vaultys/VaultysClaw/sdk-go/identity"
)

// Duplicated from the sensor's own vconn tests rather than shared: Go test
// helpers can't cross a package boundary without exporting them into the
// production API, and these two are smaller than the machinery that sharing
// them would require.

func newTestIdentity(t *testing.T) *identity.Provider {
	t.Helper()
	p, err := identity.LoadOrCreate(t.TempDir() + "/identity.secret")
	if err != nil {
		t.Fatalf("identity.LoadOrCreate: %v", err)
	}
	return p
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
