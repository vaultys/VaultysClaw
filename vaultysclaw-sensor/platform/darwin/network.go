//go:build darwin

package darwin

import (
	"bufio"
	"context"
	"os/exec"
	"strconv"
	"strings"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
)

// NetworkCollector collects TCP socket metadata via `lsof -i -P -n`. `-n`
// suppresses lsof's own hostname lookups (kept fast/non-invasive); the
// sensor does its own bounded, cached reverse-DNS resolution when needed
// (see internal/collector.ResolverCache).
type NetworkCollector struct{}

func NewNetworkCollector() *NetworkCollector { return &NetworkCollector{} }

// Connections lists TCP sockets (outbound + listening) with PID
// association. lsof only sees sockets the invoking user is permitted to
// see; it may exit non-zero while still printing partial output when it
// hits processes it can't inspect — that partial output is still used.
func (c *NetworkCollector) Connections(ctx context.Context) ([]collector.Connection, error) {
	cmd := exec.CommandContext(ctx, "lsof", "-i", "-P", "-n")
	out, err := cmd.Output()
	if err != nil && len(out) == 0 {
		return nil, err
	}

	var conns []collector.Connection
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	first := true
	for scanner.Scan() {
		line := scanner.Text()
		if first {
			first = false
			continue // header row: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
		}
		fields := strings.Fields(line)
		if len(fields) < 9 {
			continue
		}
		if fields[7] != "TCP" {
			continue // ignore UDP and other protocols
		}
		pid, err := strconv.Atoi(fields[1])
		if err != nil {
			continue
		}
		name := fields[8]
		state := ""
		if len(fields) > 9 {
			state = strings.Trim(fields[9], "()")
		}

		switch {
		case strings.Contains(name, "->"):
			parts := strings.SplitN(name, "->", 2)
			remoteHost, remotePort := collector.SplitHostPort(parts[1])
			connState := collector.ConnOther
			if state == "ESTABLISHED" {
				connState = collector.ConnEstablished
			}
			conns = append(conns, collector.Connection{
				PID:        pid,
				RemoteHost: remoteHost,
				RemotePort: remotePort,
				State:      connState,
			})
		case state == "LISTEN":
			_, localPort := collector.SplitHostPort(name)
			conns = append(conns, collector.Connection{
				PID:       pid,
				LocalPort: localPort,
				State:     collector.ConnListen,
			})
		}
	}
	return conns, nil
}
