// Package coverage answers, per harness, the one question an admin reads the
// console for: is this harness actually governed? (docs/HARNESS_HOOKS.md §6)
//
// It is computed here, on the host, from the same installer checks `doctor`
// prints, so the CLI and the console can never disagree about a host. The
// control plane stores and shows the report; it does not re-derive it.
//
// The rule it exists to enforce: **never say "enforcing" for a harness whose
// sensitive actions are not all hooked.** Every way a harness can be less than
// fully governed — no decision hook, a broken one, observe mode, a vendor
// protocol that cannot see some actions — lowers the level, and each one is
// named in Reasons.
package coverage

import (
	"sort"

	"github.com/vaultys/vaultysclaw-hooks/internal/install"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// Level is how far a harness is governed. Ordered from best to worst; the
// console's wording follows these names exactly.
type Level string

const (
	// Enforcing: every sensitive action reaches a decision hook, and refusals
	// are applied.
	Enforcing Level = "enforcing"
	// Partial: refusals are applied, but the harness's hook protocol does not
	// show us every sensitive action (Gaps), so some run ungoverned.
	Partial Level = "partial"
	// Observe: hooked, but in observe mode — decisions are recorded, nothing is
	// refused.
	Observe Level = "observe"
	// Ungoverned: the harness is on this host and no working decision hook is.
	Ungoverned Level = "ungoverned"
)

// Vendor is one harness's coverage.
type Vendor struct {
	Vendor  string   `json:"vendor"`
	Level   Level    `json:"level"`
	Found   bool     `json:"found"`
	Reasons []string `json:"reasons,omitempty"`
}

// Report is a host's coverage, as sent in a hook_coverage message.
type Report struct {
	Mode  state.Mode  `json:"mode"`
	Scope state.Scope `json:"scope"`
	// TamperResistant is false at user scope: anything running as the user —
	// including the governed agent — can remove a user-scope hook.
	TamperResistant bool     `json:"tamperResistant"`
	Vendors         []Vendor `json:"vendors"`
}

// Compute derives the report. A harness that is neither found on the host nor
// has anything of ours installed is left out: it is not there to govern.
func Compute(mode state.Mode, scope state.Scope, checks []install.Check) Report {
	r := Report{Mode: mode, Scope: scope, TamperResistant: scope == state.ScopeMachine, Vendors: []Vendor{}}
	for _, c := range checks {
		if !c.HarnessFound && len(c.Installed) == 0 {
			continue
		}
		r.Vendors = append(r.Vendors, vendorLevel(mode, c))
	}
	sort.Slice(r.Vendors, func(i, j int) bool { return r.Vendors[i].Vendor < r.Vendors[j].Vendor })
	return r
}

func vendorLevel(mode state.Mode, c install.Check) Vendor {
	v := Vendor{Vendor: c.Vendor, Found: c.HarnessFound}
	switch {
	case len(c.Installed) == 0:
		v.Level = Ungoverned
		v.Reasons = append(v.Reasons, "no hooks installed")
		return v
	case !c.Decides:
		v.Level = Ungoverned
		v.Reasons = append(v.Reasons, "the decision hook is not installed; tool calls are only watched")
		return v
	case len(c.Problems) > 0:
		// A hook pointing at a missing binary fails however the harness
		// handles that failure; none of them is "governed".
		v.Level = Ungoverned
		v.Reasons = append(v.Reasons, c.Problems...)
		return v
	case mode != state.ModeEnforce:
		v.Level = Observe
		v.Reasons = append(v.Reasons, "observe mode: decisions are recorded, nothing is refused")
		v.Reasons = append(v.Reasons, c.Gaps...)
		return v
	case len(c.Gaps) > 0:
		v.Level = Partial
		v.Reasons = append(v.Reasons, c.Gaps...)
		return v
	}
	v.Level = Enforcing
	return v
}

// ForHost runs every installer's check and computes the report. An unreadable
// config is reported as enforce, matching how the hook itself treats it.
func ForHost(o install.Options, installers []install.Installer) Report {
	mode := state.ModeEnforce
	if cfg, err := state.LoadConfig(state.PathsFor(o.Scope, o.StateDir).Config); err == nil {
		mode = cfg.Mode
	}
	checks := make([]install.Check, 0, len(installers))
	for _, in := range installers {
		checks = append(checks, in.Check(o))
	}
	return Compute(mode, o.Scope, checks)
}
