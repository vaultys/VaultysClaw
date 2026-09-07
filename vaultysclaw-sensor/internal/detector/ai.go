package detector

import (
	"strconv"
	"strings"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
	"github.com/vaultys/vaultysclaw-sensor/internal/config"
	"github.com/vaultys/vaultysclaw-sensor/internal/correlation"
)

// longRunningThreshold is how long a process must have been active before
// "long-running" signals fire. Exported as a var (not const) so tests can
// shrink it instead of needing to fabricate 30-minute-old fixtures.
var longRunningThreshold = 30 * time.Minute

// providerMatch is a positive match of a connection's remote host against
// a configured AI provider.
type providerMatch struct {
	Provider string
}

// matchProviderHost checks a resolved remote host against configured
// provider host patterns: exact match, suffix match for entries prefixed
// with a dot (e.g. ".openai.azure.com"), or substring match for bare
// fragments (e.g. "amazonaws.com").
func matchProviderHost(host string, providers []config.ProviderRule) *providerMatch {
	lower := strings.ToLower(host)
	if lower == "" {
		return nil
	}
	for _, p := range providers {
		for _, h := range p.Hosts {
			hl := strings.ToLower(h)
			if hl == "" {
				continue
			}
			if strings.HasPrefix(hl, ".") {
				if strings.HasSuffix(lower, hl) {
					return &providerMatch{Provider: p.Name}
				}
				continue
			}
			if lower == hl || strings.HasSuffix(lower, "."+hl) || strings.Contains(lower, hl) {
				return &providerMatch{Provider: p.Name}
			}
		}
	}
	return nil
}

// evaluateAI returns AI-confidence signals plus the best-matched provider
// name (empty if none matched). rt is the already-computed local-runtime
// match for this process (computed once by Classify and threaded through,
// rather than re-detected here).
func evaluateAI(
	obs correlation.Observation,
	cfg *config.Sensor,
	resolver *collector.ResolverCache,
	index *collector.ProviderIndex,
	rt *collector.LocalRuntimeMatch,
	app *collector.AIApplicationMatch,
) ([]Signal, string) {
	var signals []Signal
	provider := ""
	isBrowser := collector.IsBrowserProcess(obs.Process.Name, cfg.BrowserProcess)

	providerHits := 0
	for _, conn := range obs.Connections {
		host := conn.RemoteHost
		if resolver != nil {
			if resolved := resolver.Resolve(conn.RemoteHost); resolved != "" {
				host = resolved
			}
		}
		matched := ""
		byIP := false
		if m := matchProviderHost(host, cfg.Providers); m != nil {
			matched = m.Provider
		} else if p := index.Lookup(conn.RemoteHost); p != "" {
			// The hostname told us nothing — either the OS gave us a bare IP
			// with no PTR record (the normal case for CDN-fronted AI APIs), or
			// the PTR pointed at the CDN rather than the tenant. Fall back to
			// the forward-resolved catalog index.
			matched = p
			byIP = true
		}
		if matched == "" {
			continue
		}
		providerHits++
		if provider == "" {
			provider = matched
		}
		switch {
		case byIP:
			// Weaker than a name match on purpose: CDN address space is shared,
			// so an address in the index is good evidence of the provider but
			// not conclusive the way a resolved hostname is.
			signals = append(signals, Signal{Weight: WeightMedium, Reason: "connected to an address published by a known AI provider (" + matched + ")"})
		case isBrowser:
			signals = append(signals, Signal{Weight: WeightStrong, Reason: "browser connected to known AI service (" + matched + ")"})
		default:
			signals = append(signals, Signal{Weight: WeightStrong, Reason: "non-browser process connected to known AI API (" + matched + ")"})
		}
	}

	if !isBrowser && providerHits > 1 {
		signals = append(signals, Signal{Weight: WeightMedium, Reason: "repeated connectivity to AI provider"})
	}

	if !obs.Process.StartTime.IsZero() && providerHits > 0 {
		if age := time.Since(obs.Process.StartTime); age >= longRunningThreshold {
			signals = append(signals, Signal{Weight: WeightMedium, Reason: "process has been active for more than 30 minutes"})
		}
	}

	if app != nil {
		switch app.Kind {
		case config.AppKindIDE:
			// An installed AI-capable editor is not, by itself, AI usage: the
			// machine has VS Code on it. It only counts when this same process
			// is also talking to a provider — which is exactly what an inline
			// completion or an in-editor chat looks like from out here.
			if providerHits > 0 {
				signals = append(signals, Signal{Weight: WeightMedium, Reason: "AI-capable editor with provider connectivity (" + app.Name + ")"})
			}
		default:
			if app.ViaAncestor {
				signals = append(signals, Signal{Weight: WeightMedium, Reason: "child process of a known AI application (" + app.Name + ")"})
			} else {
				signals = append(signals, Signal{Weight: WeightStrong, Reason: "known AI application detected (" + app.Name + ", matched on " + app.Reason + ")"})
			}
		}
		if provider == "" && app.Kind != config.AppKindIDE {
			provider = app.Name
		}
	}

	if rt != nil {
		if provider == "" {
			provider = rt.Name
		}
		switch {
		case rt.MatchedByProcessName || rt.MatchedByCmdline:
			signals = append(signals, Signal{Weight: WeightStrong, Reason: "known local model runtime detected (" + rt.Name + ")"})
		case rt.MatchedByPortOnly:
			signals = append(signals, Signal{Weight: WeightWeak, Reason: "listening on a known AI-related local port (" + strconv.Itoa(rt.Port) + ")"})
		}
	}

	return signals, provider
}
