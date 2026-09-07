package config

import (
	"fmt"
	"log/slog"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

// CatalogWatcher holds the effective rule set — built-in defaults with the
// operator's catalog merged in — and re-reads that catalog when the file
// changes on disk.
//
// Reloading matters more here than it does for most configuration. A new
// coding harness ships and is on developers' machines within days; the sensor
// that is supposed to see it may be a long-lived daemon on a fleet of laptops
// that nobody wants to restart. Dropping a rule into a file and having it take
// effect on the next poll cycle is the difference between a catalog that stays
// current and one that is updated at the next redeploy, whenever that is.
//
// A reload that fails validation is refused and logged: the running rule set
// stays exactly as it was. A half-parsed catalog would quietly stop detecting
// things, which is the one failure mode a detection sensor must not have.
type CatalogWatcher struct {
	// base is pristine — the catalog is never applied to it. Every reload
	// re-merges from here, so removing a `disable:` entry restores the built-in
	// rule it was suppressing, which re-merging onto the live set could not do.
	base    *Sensor
	path    string
	logger  *slog.Logger
	current atomic.Pointer[Sensor]

	mu       sync.Mutex
	lastMod  time.Time
	lastSize int64
	loaded   bool
}

// NewCatalogWatcher merges the catalog at base.CatalogPath over base and
// returns a watcher holding the result. A missing catalog file is normal and
// yields the built-ins; a malformed one is an error at startup, where an
// operator will see it, rather than a silent fallback.
func NewCatalogWatcher(base *Sensor, logger *slog.Logger) (*CatalogWatcher, error) {
	if logger == nil {
		logger = slog.Default()
	}
	w := &CatalogWatcher{base: base, path: base.CatalogPath, logger: logger}
	cat, err := LoadCatalog(w.path)
	if err != nil {
		return nil, err
	}
	w.stampLocked()
	w.current.Store(base.Apply(cat))
	w.loaded = true
	return w, nil
}

// Current returns the effective config. Callers should take it once per poll
// cycle and use that snapshot for the whole cycle, so a reload mid-cycle can
// never classify half the process table under one rule set and half under
// another.
func (w *CatalogWatcher) Current() *Sensor { return w.current.Load() }

// Path is the catalog file being watched, for logging.
func (w *CatalogWatcher) Path() string { return w.path }

// Reload re-reads the catalog if the file's modification time or size has
// changed, and reports whether the effective rule set was replaced. An
// unreadable or invalid file leaves the current rule set untouched and returns
// the error for the caller to log — never a reason to stop polling.
func (w *CatalogWatcher) Reload() (bool, error) {
	if w.path == "" {
		return false, nil
	}
	w.mu.Lock()
	defer w.mu.Unlock()

	if !w.changedLocked() {
		return false, nil
	}

	cat, err := LoadCatalog(w.path)
	if err != nil {
		// Deliberately do not stamp: a file that is being edited in place will
		// be re-read on the next cycle, so a save-in-progress costs one cycle
		// rather than requiring a restart to recover from.
		return false, fmt.Errorf("catalog reload refused, keeping the running rule set: %w", err)
	}
	w.stampLocked()
	w.current.Store(w.base.Apply(cat))
	return true, nil
}

// changedLocked reports whether the file differs from what was last loaded.
// Deletion counts as a change — it means "go back to the built-ins", which is
// a legitimate way to back out a bad catalog.
func (w *CatalogWatcher) changedLocked() bool {
	info, err := os.Stat(w.path)
	if err != nil {
		return w.loaded && !w.lastMod.IsZero()
	}
	return !info.ModTime().Equal(w.lastMod) || info.Size() != w.lastSize
}

func (w *CatalogWatcher) stampLocked() {
	info, err := os.Stat(w.path)
	if err != nil {
		w.lastMod, w.lastSize = time.Time{}, 0
		return
	}
	w.lastMod, w.lastSize = info.ModTime(), info.Size()
}

// Summary describes the effective rule set, for a startup and post-reload log
// line. An operator who just edited a catalog needs to see that the count
// moved, not merely that a reload happened.
func (w *CatalogWatcher) Summary() []any {
	c := w.Current()
	return []any{
		"catalog", w.path,
		"providers", len(c.Providers),
		"applications", len(c.AIApplications),
		"localRuntimes", len(c.LocalRuntimes),
		"mcpServers", len(c.MCPServers),
		"agentFrameworks", len(c.AgentFrameworks),
	}
}
