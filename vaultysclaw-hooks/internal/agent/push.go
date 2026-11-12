package agent

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/rules"
	"github.com/vaultys/VaultysClaw/sdk-go/vconn"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// pushedConfig is the subset of the harness kind's kindConfig this package
// understands (packages/controlplane/lib/harness-kind.ts). Both tag sets are
// needed: the signed copy is msgpack, the unsigned copy JSON. Pointers keep
// "absent" distinct from the zero value.
type pushedConfig struct {
	Mode                *string `json:"mode" msgpack:"mode"`
	MaxStatusAgeSeconds *int    `json:"maxStatusAgeSeconds" msgpack:"maxStatusAgeSeconds"`
}

// PushReport says what a push changed, for the agent's log.
type PushReport struct {
	GrantWritten bool
	RulesWritten bool
	// SignedConfig reports whether settings came from a verified token (and so
	// could move in either direction) or from the unsigned copy (tighten only).
	SignedConfig bool
	Changed      []string
	Refused      []string
}

// ApplyPush handles one actor_config.
//
// Order is load-bearing:
//
//  1. Every signed artefact in the push is verified *before* anything is
//     written. A push that carries one bad token writes nothing at all —
//     applying a fresh grant next to a stale rule set would enforce a
//     combination no admin authored.
//  2. A nil token clears nothing. The control plane sends null when it has
//     nothing to give, and an unauthenticated message must not be able to erase
//     a working policy.
//  3. Settings: a signed kindConfig is authoritative in both directions; an
//     unsigned one may only tighten.
//
// The unsigned trust block is deliberately ignored. Its staleness bound would
// have to be persisted tighten-only, and a tighten-only value written to disk is
// a ratchet: an admin could later relax the org-wide bound and this host would
// never follow. The harness kind's own maxStatusAgeSeconds, signed in the
// kindConfig, is the knob for this host, and moves both ways.
func ApplyPush(scope state.Scope, p state.Paths, anchor *grant.Anchor, payload vconn.ActorConfigPayload, now time.Time) (PushReport, error) {
	var rep PushReport

	if payload.GrantToken != nil {
		if _, err := grant.Verify(anchor.VaultysID(), *payload.GrantToken, now); err != nil {
			return rep, fmt.Errorf("agent: pushed grant does not verify against %s; nothing applied: %w", anchor.DID(), err)
		}
	}
	if payload.RuleSetToken != nil {
		set, err := rules.VerifySet(anchor.VaultysID(), *payload.RuleSetToken)
		if err != nil {
			return rep, fmt.Errorf("agent: pushed rule set does not verify against %s; nothing applied: %w", anchor.DID(), err)
		}
		if err := set.Validate(false); err != nil {
			return rep, fmt.Errorf("agent: pushed rule set is not usable here; nothing applied: %w", err)
		}
	}

	var signed *pushedConfig
	if payload.KindConfigToken != nil && *payload.KindConfigToken != "" {
		raw, err := grant.Open(anchor.VaultysID(), *payload.KindConfigToken)
		if err != nil {
			// Never fall back to the unsigned copy: it is the same content, so
			// accepting it after a signature failure would make forging a config
			// no harder than corrupting a byte of the real one.
			return rep, fmt.Errorf("agent: pushed kindConfig signature does not verify; nothing applied: %w", err)
		}
		var cfg pushedConfig
		if err := msgpack.Unmarshal(raw, &cfg); err != nil {
			return rep, fmt.Errorf("agent: decoding the signed kindConfig; nothing applied: %w", err)
		}
		signed = &cfg
	}

	perm := filePerm(scope)
	if payload.GrantToken != nil {
		if err := writeFileAtomic(p.Grant, []byte(*payload.GrantToken), perm); err != nil {
			return rep, err
		}
		rep.GrantWritten = true
	}
	if payload.RuleSetToken != nil {
		if err := writeFileAtomic(p.Rules, []byte(*payload.RuleSetToken), perm); err != nil {
			return rep, err
		}
		rep.RulesWritten = true
	}

	cfg, err := state.LoadConfig(p.Config)
	if err != nil {
		// A local config that cannot be read is not something a push should
		// paper over by writing a fresh one: the operator's file may have said
		// enforce. Report it and keep the artefacts that were applied.
		return rep, fmt.Errorf("agent: local config unreadable, settings not applied: %w", err)
	}
	before := cfg
	if signed != nil {
		rep.SignedConfig = true
		applySigned(&cfg, *signed, &rep)
	} else if len(payload.KindConfig) > 0 && string(payload.KindConfig) != "null" {
		var unsigned pushedConfig
		if err := json.Unmarshal(payload.KindConfig, &unsigned); err != nil {
			return rep, fmt.Errorf("agent: unsigned kindConfig ignored: %w", err)
		}
		applyUnsigned(&cfg, unsigned, &rep)
	}
	if cfg.Mode != before.Mode || cfg.MaxStatusAgeSeconds != before.MaxStatusAgeSeconds {
		data, err := json.MarshalIndent(cfg, "", "  ")
		if err != nil {
			return rep, err
		}
		if err := writeFileAtomic(p.Config, append(data, '\n'), perm); err != nil {
			return rep, err
		}
	}
	return rep, nil
}

// modeFromPush maps the harness kind's vocabulary ("observe" | "explicit") to
// this package's. Unknown values are reported, never guessed.
func modeFromPush(m string) (state.Mode, bool) {
	switch m {
	case "observe":
		return state.ModeObserve, true
	case "explicit", "enforce":
		return state.ModeEnforce, true
	}
	return "", false
}

func applySigned(cfg *state.Config, pushed pushedConfig, rep *PushReport) {
	if pushed.Mode != nil {
		if m, ok := modeFromPush(*pushed.Mode); !ok {
			rep.Refused = append(rep.Refused, fmt.Sprintf("mode %q is not a known mode", *pushed.Mode))
		} else if m != cfg.Mode {
			rep.Changed = append(rep.Changed, fmt.Sprintf("mode %s → %s", cfg.Mode, m))
			cfg.Mode = m
		}
	}
	if pushed.MaxStatusAgeSeconds != nil && *pushed.MaxStatusAgeSeconds != cfg.MaxStatusAgeSeconds {
		rep.Changed = append(rep.Changed, fmt.Sprintf("maxStatusAgeSeconds %d → %d", cfg.MaxStatusAgeSeconds, *pushed.MaxStatusAgeSeconds))
		cfg.MaxStatusAgeSeconds = *pushed.MaxStatusAgeSeconds
	}
}

func applyUnsigned(cfg *state.Config, pushed pushedConfig, rep *PushReport) {
	if pushed.Mode != nil {
		m, ok := modeFromPush(*pushed.Mode)
		switch {
		case !ok:
			rep.Refused = append(rep.Refused, fmt.Sprintf("mode %q is not a known mode", *pushed.Mode))
		case m == state.ModeEnforce && cfg.Mode != state.ModeEnforce:
			rep.Changed = append(rep.Changed, fmt.Sprintf("mode %s → %s (unsigned, tightened)", cfg.Mode, m))
			cfg.Mode = m
		case m == state.ModeObserve && cfg.Mode == state.ModeEnforce:
			rep.Refused = append(rep.Refused, "mode enforce → observe (unsigned config may only tighten)")
		}
	}
	if pushed.MaxStatusAgeSeconds != nil && *pushed.MaxStatusAgeSeconds != cfg.MaxStatusAgeSeconds {
		if stricterAge(*pushed.MaxStatusAgeSeconds, cfg.MaxStatusAgeSeconds) {
			rep.Changed = append(rep.Changed, fmt.Sprintf("maxStatusAgeSeconds %d → %d (unsigned, tightened)", cfg.MaxStatusAgeSeconds, *pushed.MaxStatusAgeSeconds))
			cfg.MaxStatusAgeSeconds = *pushed.MaxStatusAgeSeconds
		} else {
			rep.Refused = append(rep.Refused, fmt.Sprintf("maxStatusAgeSeconds %d → %d (unsigned config may only tighten)", cfg.MaxStatusAgeSeconds, *pushed.MaxStatusAgeSeconds))
		}
	}
}

// stricterAge orders staleness bounds: negative (unbounded) is the loosest, 0
// the strictest, and between positives the smaller is stricter.
func stricterAge(pushed, local int) bool {
	if pushed < 0 {
		return false
	}
	if local < 0 {
		return true
	}
	return pushed < local
}

// fileExists is used by the agent's startup log.
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
