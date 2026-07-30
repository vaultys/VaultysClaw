package collector

import (
	"context"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"
)

// SplitHostPort splits a "host:port" string into its parts, handling
// bracketed IPv6 addresses ("[::1]:443"). Returns port 0 if it can't be
// parsed. Shared by every platform's network collector so each one only
// needs to hand it whatever raw address:port token its OS tool prints.
func SplitHostPort(hostport string) (string, int) {
	hostport = strings.TrimSpace(hostport)
	if idx := strings.LastIndex(hostport, "]:"); idx != -1 {
		host := strings.TrimPrefix(hostport[:idx+1], "[")
		host = strings.TrimSuffix(host, "]")
		port, _ := strconv.Atoi(hostport[idx+2:])
		return host, port
	}
	if idx := strings.LastIndex(hostport, ":"); idx != -1 {
		host := hostport[:idx]
		port, _ := strconv.Atoi(hostport[idx+1:])
		return host, port
	}
	return hostport, 0
}

// ResolverCache does best-effort, bounded, cached reverse-DNS lookups so
// providers configured by hostname (e.g. "api.openai.com") can be matched
// even when the OS only exposes a raw IP for a connection. This is a
// standard reverse-DNS query — no payload inspection, no TLS interception —
// and is cached + timeout-bounded so it stays cheap and never blocks a poll
// cycle waiting on a slow/unresponsive resolver.
type ResolverCache struct {
	mu      sync.Mutex
	entries map[string]string
	timeout time.Duration
}

// NewResolverCache creates a cache with the given per-lookup timeout.
func NewResolverCache(timeout time.Duration) *ResolverCache {
	return &ResolverCache{entries: make(map[string]string), timeout: timeout}
}

// Resolve returns a best-effort hostname for ip, or "" if none could be
// resolved within the timeout. Results (including failures) are cached for
// the lifetime of the process.
func (r *ResolverCache) Resolve(ip string) string {
	r.mu.Lock()
	if host, ok := r.entries[ip]; ok {
		r.mu.Unlock()
		return host
	}
	r.mu.Unlock()

	host := r.lookup(ip)

	r.mu.Lock()
	r.entries[ip] = host
	r.mu.Unlock()
	return host
}

func (r *ResolverCache) lookup(ip string) string {
	if net.ParseIP(ip) == nil {
		// Already a hostname (some platform tools resolve for us).
		return ip
	}
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()
	names, err := net.DefaultResolver.LookupAddr(ctx, ip)
	if err != nil || len(names) == 0 {
		return ""
	}
	return strings.TrimSuffix(names[0], ".")
}
