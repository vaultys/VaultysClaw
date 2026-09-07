package supervise

import (
	"sync"
	"time"
)

// Settings holds the enforcement settings that can change while a harness
// session is running.
//
// # What can change live, and what genuinely cannot
//
// The signed rule set and the certificate were already live: `Daemon.ConfigFor`
// re-reads the store on every decision, so a rule an admin adds applies to the
// next tool call. This type extends that to the settings that had been captured
// at launch for no better reason than that they were scalars — mode and the
// staleness bound are read per decision too, and there was never anything about
// them that required a restart.
//
// **OS confinement is the one that genuinely cannot.** The seatbelt profile is
// applied to the harness process at exec time and a running process cannot be
// re-confined, so a change to `sandbox` — and to the kernel-enforced half of a
// `deny file://…` rule, which is compiled into that same profile — takes effect
// on the next launch. That is a property of the mechanism, not a gap in this
// code, and the supervisor says so specifically rather than telling an operator
// to restart for changes that already applied.
type Settings struct {
	mu           sync.RWMutex
	mode         Mode
	maxStatusAge time.Duration
	failClosed   bool
}

// NewSettings seeds from the host's own configuration.
func NewSettings(mode Mode, maxStatusAge time.Duration, failClosed bool) *Settings {
	return &Settings{mode: mode, maxStatusAge: maxStatusAge, failClosed: failClosed}
}

// Snapshot reads the current values. Taken as a set rather than field by field
// so a decision cannot straddle an update and mix settings from two
// configurations — a call decided under the old mode and the new staleness bound
// is one no admin ever authored.
func (s *Settings) Snapshot() (Mode, time.Duration, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mode, s.maxStatusAge, s.failClosed
}

// Mode reports the current mode, for a log line.
func (s *Settings) Mode() Mode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mode
}

// Apply installs the settings that take effect without a restart, and reports
// what it changed. It deliberately does not touch sandbox — see the type doc.
func (s *Settings) Apply(mode *string, maxStatusAgeSeconds *int) []string {
	s.mu.Lock()
	defer s.mu.Unlock()

	var changed []string
	if mode != nil && Mode(*mode) != s.mode {
		// An unrecognised mode is ignored rather than guessed at: it could be a
		// newer, stricter setting this binary does not know, and running under a
		// mode whose meaning is unknown is worse than running under the old one.
		if *mode == string(ModeObserve) || *mode == string(ModeExplicit) {
			changed = append(changed, "mode "+string(s.mode)+" → "+*mode)
			s.mode = Mode(*mode)
		}
	}
	if maxStatusAgeSeconds != nil {
		if d := time.Duration(*maxStatusAgeSeconds) * time.Second; d != s.maxStatusAge {
			changed = append(changed, "maxStatusAgeSeconds "+
				formatSeconds(s.maxStatusAge)+" → "+formatSeconds(d))
			s.maxStatusAge = d
		}
	}
	return changed
}

func formatSeconds(d time.Duration) string {
	return time.Duration(d).String()
}
