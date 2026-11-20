package coverage

import (
	"testing"

	"github.com/vaultys/vaultysclaw-hooks/internal/install"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

func TestLevels(t *testing.T) {
	full := install.Check{Vendor: "a", HarnessFound: true, Installed: []string{"PreToolUse"}, Decides: true}
	cases := []struct {
		name string
		mode state.Mode
		chk  install.Check
		want Level
	}{
		{"fully hooked, enforce", state.ModeEnforce, full, Enforcing},
		{"fully hooked, observe", state.ModeObserve, full, Observe},
		{"vendor gaps", state.ModeEnforce, withGaps(full), Partial},
		{"gaps never lift observe", state.ModeObserve, withGaps(full), Observe},
		{"found, nothing installed", state.ModeEnforce, install.Check{Vendor: "a", HarnessFound: true}, Ungoverned},
		{"audit hooks only", state.ModeEnforce, install.Check{Vendor: "a", HarnessFound: true, Installed: []string{"Stop"}}, Ungoverned},
		{"broken hook", state.ModeEnforce, withProblem(full), Ungoverned},
	}
	for _, c := range cases {
		r := Compute(c.mode, state.ScopeMachine, []install.Check{c.chk})
		if len(r.Vendors) != 1 || r.Vendors[0].Level != c.want {
			t.Errorf("%s: got %+v, want %s", c.name, r.Vendors, c.want)
			continue
		}
		if c.want != Enforcing && len(r.Vendors[0].Reasons) == 0 {
			t.Errorf("%s: a level below enforcing must say why", c.name)
		}
	}
}

func TestAbsentHarnessIsOmittedAndScopeIsReported(t *testing.T) {
	r := Compute(state.ModeEnforce, state.ScopeUser, []install.Check{{Vendor: "absent"}})
	if len(r.Vendors) != 0 {
		t.Fatalf("a harness that is not on the host is not ungoverned, it is absent: %+v", r.Vendors)
	}
	if r.TamperResistant {
		t.Fatal("user scope is not tamper-resistant")
	}
	if !Compute(state.ModeEnforce, state.ScopeMachine, nil).TamperResistant {
		t.Fatal("machine scope is")
	}
}

func withGaps(c install.Check) install.Check {
	c.Gaps = []string{"file writes are not hooked"}
	return c
}

func withProblem(c install.Check) install.Check {
	c.Problems = []string{"hook binary missing"}
	return c
}
