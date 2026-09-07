package collector

import (
	"context"
	"log/slog"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/config"
)

// ProviderIndex maps remote IP addresses to configured provider names by
// resolving the provider catalog's hostnames *forward* and inverting the
// result.
//
// This exists because reverse DNS does not work for this problem. On macOS
// and Windows the OS only ever hands us a peer IP, and the major AI APIs sit
// behind CDNs that publish no PTR record at all: `api.anthropic.com` resolves
// to 160.79.104.10, and asking that address for its name returns nothing. A
// sensor relying on ResolverCache alone therefore sees a laptop running
// Claude Code, Codex and Kimi and matches zero providers on any of them.
// Resolving the catalog forward and matching on the IP set is the only
// portable way to close that gap without inspecting traffic.
//
// The index is best-effort and additive: a miss simply means no provider
// signal, exactly as before. Entries are never trusted as *proof* — the
// detector weights an IP-index hit below a hostname match, because CDN
// address space is shared and an anycast address can be reused by another
// tenant of the same CDN.
type ProviderIndex struct {
	mu       sync.RWMutex
	byIP     map[string]string
	interval time.Duration
	timeout  time.Duration
	logger   *slog.Logger

	hostsMu sync.Mutex
	hosts   []indexedHost
}

type indexedHost struct {
	host     string
	provider string
}

// NewProviderIndex builds an index over the resolvable hostnames in the
// provider catalog. Wildcard and fragment entries (".openai.azure.com",
// "bedrock-runtime") are skipped: they are patterns, not names, and there is
// nothing to look up.
func NewProviderIndex(providers []config.ProviderRule, refresh, timeout time.Duration, logger *slog.Logger) *ProviderIndex {
	if logger == nil {
		logger = slog.Default()
	}
	var hosts []indexedHost
	for _, p := range providers {
		for _, h := range p.Hosts {
			if isResolvableHost(h) {
				hosts = append(hosts, indexedHost{host: h, provider: p.Name})
			}
		}
	}
	return &ProviderIndex{
		byIP:     make(map[string]string),
		interval: refresh,
		timeout:  timeout,
		hosts:    hosts,
		logger:   logger,
	}
}

// SetProviders swaps in a new provider catalog — used when the rule catalog is
// reloaded at runtime. Already-indexed addresses are kept: a provider that is
// still in the catalog should not stop resolving for up to a refresh interval
// just because an unrelated rule was edited. Refresh the index afterwards to
// pick up the new hosts immediately.
func (p *ProviderIndex) SetProviders(providers []config.ProviderRule) {
	var hosts []indexedHost
	for _, pr := range providers {
		for _, h := range pr.Hosts {
			if isResolvableHost(h) {
				hosts = append(hosts, indexedHost{host: h, provider: pr.Name})
			}
		}
	}
	p.hostsMu.Lock()
	p.hosts = hosts
	p.hostsMu.Unlock()
}

func (p *ProviderIndex) snapshotHosts() []indexedHost {
	p.hostsMu.Lock()
	defer p.hostsMu.Unlock()
	return append([]indexedHost(nil), p.hosts...)
}

// isResolvableHost reports whether an entry is a real hostname rather than one
// of matchProviderHost's pattern forms.
func isResolvableHost(h string) bool {
	h = strings.TrimSpace(h)
	if h == "" || strings.HasPrefix(h, ".") {
		return false
	}
	// A bare fragment like "bedrock-runtime" has no dot and is a substring
	// pattern, not a name.
	return strings.Contains(h, ".")
}

// Lookup returns the provider an IP is known to belong to, or "" for a miss.
func (p *ProviderIndex) Lookup(ip string) string {
	if p == nil {
		return ""
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.byIP[ip]
}

// Run refreshes the index immediately and then on every interval until ctx is
// cancelled. Failures are logged at debug and leave the previous mapping in
// place: a resolver outage must degrade detection, never erase it.
func (p *ProviderIndex) Run(ctx context.Context) {
	p.Refresh(ctx)
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.Refresh(ctx)
		}
	}
}

// Refresh re-resolves every catalog hostname and swaps in the new mapping.
// Addresses that disappear from DNS are retained for one further cycle by
// merging over the existing map — CDN answers rotate, and dropping an address
// the moment it falls out of a rotation would make detection flap.
func (p *ProviderIndex) Refresh(ctx context.Context) {
	hosts := p.snapshotHosts()
	next := make(map[string]string, len(hosts)*2)

	p.mu.RLock()
	for ip, provider := range p.byIP {
		next[ip] = provider
	}
	p.mu.RUnlock()

	resolved := 0
	for _, h := range hosts {
		if ctx.Err() != nil {
			return
		}
		lctx, cancel := context.WithTimeout(ctx, p.timeout)
		addrs, err := net.DefaultResolver.LookupHost(lctx, h.host)
		cancel()
		if err != nil {
			p.logger.Debug("sensor: provider host did not resolve", "host", h.host, "error", err)
			continue
		}
		for _, a := range addrs {
			next[a] = h.provider
			resolved++
		}
	}

	p.mu.Lock()
	p.byIP = next
	p.mu.Unlock()
	p.logger.Debug("sensor: provider IP index refreshed", "hosts", len(hosts), "addresses", len(next), "resolvedThisCycle", resolved)
}

// Size reports how many addresses the index currently holds.
func (p *ProviderIndex) Size() int {
	if p == nil {
		return 0
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.byIP)
}

// Seed inserts a known IP→provider mapping. Exists for tests and for
// operators pre-seeding an address they have already attributed; a normal
// deployment fills the index entirely from Refresh.
func (p *ProviderIndex) Seed(ip, provider string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.byIP[ip] = provider
}
