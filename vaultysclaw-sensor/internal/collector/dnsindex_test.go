package collector

import (
	"context"
	"testing"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/config"
)

func TestProviderIndexSkipsPatternEntries(t *testing.T) {
	// ".openai.azure.com" is a suffix pattern and "bedrock-runtime" a bare
	// fragment — neither is a name, and trying to resolve them would just burn
	// a lookup timeout every refresh.
	for _, h := range []string{"", ".openai.azure.com", "bedrock-runtime", "  "} {
		if isResolvableHost(h) {
			t.Errorf("%q should not be treated as resolvable", h)
		}
	}
	for _, h := range []string{"api.openai.com", "api.moonshot.cn"} {
		if !isResolvableHost(h) {
			t.Errorf("%q should be resolvable", h)
		}
	}
}

func TestProviderIndexRefreshKeepsPreviousEntries(t *testing.T) {
	// A resolver outage must degrade detection, never erase it: an address
	// learned earlier stays usable through a failed refresh.
	idx := NewProviderIndex(nil, time.Hour, time.Millisecond, nil)
	idx.byIP["160.79.104.10"] = "anthropic"
	idx.Refresh(context.Background())
	if got := idx.Lookup("160.79.104.10"); got != "anthropic" {
		t.Fatalf("expected the prior entry to survive a refresh, got %q", got)
	}
	if got := idx.Lookup("93.184.216.34"); got != "" {
		t.Fatalf("expected a miss, got %q", got)
	}
}

func TestNilProviderIndexIsUsable(t *testing.T) {
	// Classify is called with a nil index in local-only paths and in tests.
	var idx *ProviderIndex
	if got := idx.Lookup("1.2.3.4"); got != "" {
		t.Fatalf("nil index should miss, got %q", got)
	}
	if idx.Size() != 0 {
		t.Fatal("nil index should report size 0")
	}
}

func TestProviderIndexCoversTheDefaultCatalog(t *testing.T) {
	cfg := config.DefaultSensorConfig()
	idx := NewProviderIndex(cfg.Providers, time.Hour, time.Second, nil)
	if len(idx.hosts) < 40 {
		t.Fatalf("expected the default catalog to contribute a substantial host list, got %d", len(idx.hosts))
	}
}
