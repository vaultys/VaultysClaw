//go:build windows

package windows

import (
	"context"
	"strings"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
)

// NetworkCollector collects TCP socket metadata via
// `Get-NetTCPConnection` (Windows 8 / Server 2012+).
type NetworkCollector struct{}

func NewNetworkCollector() *NetworkCollector { return &NetworkCollector{} }

type netTCPConnection struct {
	OwningProcess int    `json:"OwningProcess"`
	LocalPort     int    `json:"LocalPort"`
	RemoteAddress string `json:"RemoteAddress"`
	RemotePort    int    `json:"RemotePort"`
	State         string `json:"State"`
}

func (c *NetworkCollector) Connections(ctx context.Context) ([]collector.Connection, error) {
	out, err := runPowerShell(ctx, `Get-NetTCPConnection | `+
		`Select-Object OwningProcess,LocalPort,RemoteAddress,RemotePort,State | `+
		`ConvertTo-Json -Compress`)
	if err != nil {
		return nil, err
	}
	items, err := decodeJSONArrayOrObject[netTCPConnection](out)
	if err != nil {
		return nil, err
	}

	conns := make([]collector.Connection, 0, len(items))
	for _, it := range items {
		switch strings.ToLower(it.State) {
		case "listen":
			conns = append(conns, collector.Connection{
				PID:       it.OwningProcess,
				LocalPort: it.LocalPort,
				State:     collector.ConnListen,
			})
		case "established":
			conns = append(conns, collector.Connection{
				PID:        it.OwningProcess,
				RemoteHost: it.RemoteAddress,
				RemotePort: it.RemotePort,
				State:      collector.ConnEstablished,
			})
		default:
			conns = append(conns, collector.Connection{
				PID:        it.OwningProcess,
				RemoteHost: it.RemoteAddress,
				RemotePort: it.RemotePort,
				State:      collector.ConnOther,
			})
		}
	}
	return conns, nil
}
