package config

import (
	_ "embed"
	"fmt"
	"sync"
)

// defaultCatalogYAML is the shipped rule set. It lives in YAML rather than in a
// Go composite literal so that the built-ins and an operator's overrides are
// the same kind of artefact, validated by the same code and read the same way:
// adding a provider upstream and adding one in a deployment are then the same
// edit, and `catalog dump` output can be pasted straight back as a catalog.
//
//go:embed default-catalog.yaml
var defaultCatalogYAML []byte

// defaultCatalog parses the embedded catalog exactly once.
//
// A failure here is a build-time defect, not a runtime condition — the file is
// compiled into the binary, so it cannot be absent, and it cannot have changed
// since the tests that validated it ran. Panicking is therefore honest: there
// is no configuration to fall back to and no operator action that would help.
// TestDefaultCatalogIsValid keeps that panic unreachable in a shipped binary.
var defaultCatalog = sync.OnceValue(func() *Catalog {
	c, err := ParseCatalog(defaultCatalogYAML)
	if err != nil {
		panic(fmt.Sprintf("config: the embedded default catalog is invalid: %v", err))
	}
	return c
})

// DefaultCatalog returns the built-in rule set. The returned value is shared;
// callers must not mutate it — use Sensor.Apply to layer changes on top, which
// copies.
func DefaultCatalog() *Catalog { return defaultCatalog() }

// DefaultCatalogYAML returns the embedded catalog document verbatim, comments
// and all. `catalog dump` prefers this over re-marshalling the parsed rules:
// the comments explain why several rules are shaped the way they are, and an
// operator starting from a dump should inherit that reasoning rather than a
// stripped-down round-trip of it.
func DefaultCatalogYAML() []byte {
	out := make([]byte, len(defaultCatalogYAML))
	copy(out, defaultCatalogYAML)
	return out
}

// DefaultBrowserProcessNames are executables treated as browsers: AI-site
// connections from these contribute to AI confidence but never to agent
// confidence.
func DefaultBrowserProcessNames() []string {
	return append([]string(nil), defaultCatalog().BrowserProcess...)
}

// DefaultSupportProcessSubstrings recognise an application's crash reporters,
// updaters and installers, which are never the AI workload. See the catalog.
func DefaultSupportProcessSubstrings() []string {
	return append([]string(nil), defaultCatalog().SupportProcess...)
}
