//go:build linux

package linux

import (
	"context"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
)

// NetworkCollector collects TCP socket metadata from /proc/net/tcp{,6},
// associated with a PID by matching socket inodes against /proc/[pid]/fd
// symlinks. Only sees sockets owned by processes the invoking user can
// read /proc/[pid]/fd for (same user, or root) — degrades gracefully
// (unassociated sockets are simply dropped) rather than requiring
// elevated privileges.
type NetworkCollector struct{}

func NewNetworkCollector() *NetworkCollector { return &NetworkCollector{} }

func (c *NetworkCollector) Connections(ctx context.Context) ([]collector.Connection, error) {
	inodeToPID := buildInodePIDMap(ctx)

	var conns []collector.Connection
	for _, path := range []string{"/proc/net/tcp", "/proc/net/tcp6"} {
		entries, err := parseProcNetTCP(path)
		if err != nil {
			continue // e.g. IPv6 disabled; not fatal
		}
		for _, e := range entries {
			pid, ok := inodeToPID[e.inode]
			if !ok {
				continue
			}
			switch e.state {
			case tcpListen:
				conns = append(conns, collector.Connection{
					PID:       pid,
					LocalPort: e.localPort,
					State:     collector.ConnListen,
				})
			case tcpEstablished:
				conns = append(conns, collector.Connection{
					PID:        pid,
					RemoteHost: e.remoteIP.String(),
					RemotePort: e.remotePort,
					State:      collector.ConnEstablished,
				})
			default:
				conns = append(conns, collector.Connection{
					PID:        pid,
					RemoteHost: e.remoteIP.String(),
					RemotePort: e.remotePort,
					State:      collector.ConnOther,
				})
			}
		}
	}
	return conns, nil
}

func buildInodePIDMap(ctx context.Context) map[uint64]int {
	m := make(map[uint64]int)
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return m
	}
	for _, e := range entries {
		select {
		case <-ctx.Done():
			return m
		default:
		}
		pid, err := strconv.Atoi(e.Name())
		if err != nil {
			continue
		}
		fdDir := filepath.Join("/proc", e.Name(), "fd")
		fds, err := os.ReadDir(fdDir)
		if err != nil {
			continue // permission denied or process gone; skip
		}
		for _, fd := range fds {
			link, err := os.Readlink(filepath.Join(fdDir, fd.Name()))
			if err != nil || !strings.HasPrefix(link, "socket:[") {
				continue
			}
			inodeStr := strings.TrimSuffix(strings.TrimPrefix(link, "socket:["), "]")
			if inode, err := strconv.ParseUint(inodeStr, 10, 64); err == nil {
				m[inode] = pid
			}
		}
	}
	return m
}

type tcpState int

const (
	tcpEstablished tcpState = iota
	tcpListen
	tcpOther
)

type tcpEntry struct {
	localPort  int
	remoteIP   net.IP
	remotePort int
	state      tcpState
	inode      uint64
}

func parseProcNetTCP(path string) ([]tcpEntry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(data), "\n")
	var out []tcpEntry
	for i, line := range lines {
		if i == 0 || strings.TrimSpace(line) == "" {
			continue // header
		}
		fields := strings.Fields(line)
		if len(fields) < 10 {
			continue
		}
		_, localPort := parseHexAddr(fields[1])
		remoteIP, remotePort := parseHexAddr(fields[2])
		stCode := fields[3]
		inode, err := strconv.ParseUint(fields[9], 10, 64)
		if err != nil {
			continue
		}

		var state tcpState
		switch strings.ToUpper(stCode) {
		case "01":
			state = tcpEstablished
		case "0A":
			state = tcpListen
		default:
			state = tcpOther
		}

		out = append(out, tcpEntry{
			localPort:  localPort,
			remoteIP:   remoteIP,
			remotePort: remotePort,
			state:      state,
			inode:      inode,
		})
	}
	return out, nil
}

// parseHexAddr parses /proc/net/tcp's "HEXIP:HEXPORT" address format. IPv4
// is 8 hex chars, IPv6 is 32; both encode each 32-bit word in
// host(little-endian)-order, which is why the bytes are reversed per word
// rather than read straight through.
func parseHexAddr(s string) (net.IP, int) {
	parts := strings.SplitN(s, ":", 2)
	if len(parts) != 2 {
		return nil, 0
	}
	hexIP := parts[0]
	port64, _ := strconv.ParseUint(parts[1], 16, 16)

	switch len(hexIP) {
	case 8:
		b := make([]byte, 4)
		for i := 0; i < 4; i++ {
			v, _ := strconv.ParseUint(hexIP[i*2:i*2+2], 16, 8)
			b[3-i] = byte(v)
		}
		return net.IP(b), int(port64)
	case 32:
		b := make([]byte, 16)
		for word := 0; word < 4; word++ {
			chunk := hexIP[word*8 : word*8+8]
			for j := 0; j < 4; j++ {
				v, _ := strconv.ParseUint(chunk[j*2:j*2+2], 16, 8)
				b[word*4+(3-j)] = byte(v)
			}
		}
		return net.IP(b), int(port64)
	default:
		return nil, int(port64)
	}
}
