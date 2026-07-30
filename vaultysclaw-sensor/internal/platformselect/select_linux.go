//go:build linux

package platformselect

import (
	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/platform/linux"
)

// New returns the process/network collector pair for the current OS.
func New() (collector.ProcessCollector, collector.NetworkCollector) {
	return linux.NewProcessCollector(), linux.NewNetworkCollector()
}
