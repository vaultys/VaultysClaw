// Package doctor answers "is this host actually governed, and how?" — the
// question an operator must be able to answer without reading the source.
package doctor

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/vaultys/vaultysclaw-hooks/internal/audit"
	"github.com/vaultys/vaultysclaw-hooks/internal/coverage"
	"github.com/vaultys/vaultysclaw-hooks/internal/hook"
	"github.com/vaultys/vaultysclaw-hooks/internal/install"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// Run prints a report and returns false when anything is broken.
func Run(o install.Options, installers []install.Installer, w io.Writer) bool {
	ok := true
	paths := state.PathsFor(o.Scope, o.StateDir)
	fmt.Fprintf(w, "scope:   %s\nstate:   %s\nspool:   %s\n", o.Scope, paths.Dir, paths.Spool)

	cfg, err := state.LoadConfig(paths.Config)
	if err != nil {
		ok = false
		fmt.Fprintf(w, "config:  ERROR %v\n", err)
	} else {
		fmt.Fprintf(w, "mode:    %s\n", cfg.Mode)
	}

	pol, err := state.LoadPolicy(paths, time.Now())
	switch {
	case err != nil:
		ok = false
		fmt.Fprintf(w, "policy:  ERROR %v\n", err)
	case pol.AnchorDID == "":
		fmt.Fprintln(w, "policy:  not provisioned (no control-plane anchor) — every governed call would be refused in enforce mode")
	case !pol.Provisioned():
		fmt.Fprintf(w, "policy:  anchor %s, no capability grant yet\n", pol.AnchorDID)
	default:
		fmt.Fprintf(w, "policy:  grant verified against %s, rule set: %v\n", pol.AnchorDID, pol.Rules != nil)
		c := pol.Certs[0]
		fmt.Fprintf(w, "status:  %s as of %s (%s), %d capabilities\n",
			c.Status, pol.SyncedAt.Format(time.RFC3339), pol.StatusSource, len(c.Capabilities))
		if pol.StatusSource == state.StatusFromPush {
			fmt.Fprintln(w, "         no signed status check for this grant yet — is `vaultysclaw-hooks agent` running?")
		}
	}

	if err := selfTest(paths); err != nil {
		ok = false
		fmt.Fprintf(w, "selftest: FAIL %v\n", err)
	} else {
		fmt.Fprintln(w, "selftest: ok (a synthetic Read of ~/.ssh/id_rsa is refused by the safety floor)")
	}

	for _, in := range installers {
		chk := in.Check(o)
		fmt.Fprintf(w, "\n[%s]\n", chk.Vendor)
		if chk.HarnessFound {
			fmt.Fprintf(w, "  harness:   found (%s)\n", chk.HarnessDetail)
		} else {
			fmt.Fprintln(w, "  harness:   not found on this host")
		}
		fmt.Fprintf(w, "  settings:  %s\n", chk.Target)
		switch {
		case len(chk.Installed) == 0:
			fmt.Fprintln(w, "  hooks:     not installed — UNGOVERNED")
			if chk.HarnessFound {
				ok = false
			}
		case len(chk.Missing) > 0:
			fmt.Fprintf(w, "  hooks:     partial (missing %s)\n", strings.Join(chk.Missing, ", "))
		default:
			fmt.Fprintf(w, "  hooks:     installed (%s)\n", strings.Join(chk.Installed, ", "))
		}
		for _, p := range chk.Problems {
			ok = false
			fmt.Fprintf(w, "  PROBLEM:   %s\n", p)
		}
		for _, g := range chk.Gaps {
			fmt.Fprintf(w, "  not seen:  %s\n", g)
		}
		for _, wn := range chk.Warnings {
			fmt.Fprintf(w, "  note:      %s\n", wn)
		}
	}

	// The same computation the agent reports to the console, so the two can
	// never disagree about this host.
	rep := coverage.ForHost(o, installers)
	fmt.Fprintln(w, "\ncoverage (as reported to the control plane):")
	if !rep.TamperResistant {
		fmt.Fprintln(w, "  user scope — anything running as this user can remove these hooks")
	}
	if len(rep.Vendors) == 0 {
		fmt.Fprintln(w, "  no supported harness found on this host")
	}
	for _, v := range rep.Vendors {
		fmt.Fprintf(w, "  %-12s %s\n", v.Vendor, v.Level)
	}
	return ok
}

// selfTest runs the real hook pipeline on a synthetic payload, against the
// real config and policy but a throwaway spool, and checks the floor fired.
func selfTest(paths state.Paths) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	tmp, err := os.MkdirTemp("", "vaultysclaw-hooks-selftest-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)
	p := paths
	p.Spool = filepath.Join(tmp, state.SpoolFile)

	payload, _ := json.Marshal(map[string]any{
		"session_id":      "selftest",
		"cwd":             home,
		"hook_event_name": "PreToolUse",
		"tool_name":       "Read",
		"tool_input":      map[string]string{"file_path": filepath.Join(home, ".ssh", "id_rsa")},
	})
	var stdout, stderr strings.Builder
	hook.Run(hook.Options{
		Vendor: "claude-code", Event: "PreToolUse", Paths: p,
		Stdin: strings.NewReader(string(payload)), Stdout: &stdout, Stderr: &stderr,
	})

	f, err := os.Open(p.Spool)
	if err != nil {
		return fmt.Errorf("no audit record written: %v", err)
	}
	defer f.Close()
	var rec audit.Record
	sc := bufio.NewScanner(f)
	if !sc.Scan() {
		return fmt.Errorf("empty audit record")
	}
	if err := json.Unmarshal(sc.Bytes(), &rec); err != nil {
		return err
	}
	if rec.Error != "" {
		return fmt.Errorf("hook reported: %s", rec.Error)
	}
	if !rec.FloorRefused {
		return fmt.Errorf("expected a floor refusal, got %+v", rec)
	}
	return nil
}
