//go:build windows

package platformselect

import (
	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/platform/windows"
)

// New returns the process/network collector pair for the current OS.
func New() (collector.ProcessCollector, collector.NetworkCollector) {
	return windows.NewProcessCollector(), windows.NewNetworkCollector()
}
