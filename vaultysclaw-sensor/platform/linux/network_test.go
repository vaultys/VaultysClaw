//go:build linux

package linux

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseHexAddr_IPv4(t *testing.T) {
	// 127.0.0.1:8080 — /proc/net/tcp encodes IPv4 little-endian per byte,
	// port big-endian.
	ip, port := parseHexAddr("0100007F:1F90")
	if ip.String() != "127.0.0.1" {
		t.Errorf("expected 127.0.0.1, got %s", ip)
	}
	if port != 8080 {
		t.Errorf("expected port 8080, got %d", port)
	}
}

func TestParseHexAddr_IPv6Loopback(t *testing.T) {
	ip, port := parseHexAddr("00000000000000000000000001000000:01BB")
	if ip.String() != "::1" {
		t.Errorf("expected ::1, got %s", ip)
	}
	if port != 443 {
		t.Errorf("expected port 443, got %d", port)
	}
}

func TestParseProcNetTCP_ListenAndEstablished(t *testing.T) {
	const contents = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000:2CAA 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 11111 1 0000000000000000 100 0 0 10 0
   1: 0100007F:C350 0300500A:01BB 01 00000000:00000000 00:00000000 00000000     0        0 22222 1 0000000000000000 100 0 0 10 0
`
	path := filepath.Join(t.TempDir(), "tcp")
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}

	entries, err := parseProcNetTCP(path)
	if err != nil {
		t.Fatalf("parseProcNetTCP: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}

	listen := entries[0]
	if listen.state != tcpListen || listen.localPort != 0x2CAA || listen.inode != 11111 {
		t.Errorf("unexpected listen entry: %+v", listen)
	}

	established := entries[1]
	if established.state != tcpEstablished || established.inode != 22222 {
		t.Errorf("unexpected established entry: %+v", established)
	}
	if established.remotePort != 0x01BB {
		t.Errorf("expected remote port 0x01BB, got %d", established.remotePort)
	}
}
