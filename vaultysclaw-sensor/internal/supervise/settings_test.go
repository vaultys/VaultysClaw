package supervise

import (
	"testing"
	"time"
)

func TestSettingsApplyLiveAndReportOnlyRealChanges(t *testing.T) {
	s := NewSettings(ModeObserve, time.Hour, true)

	explicit := "explicit"
	if changed := s.Apply(&explicit, nil); len(changed) != 1 {
		t.Fatalf("changed = %v, want the mode change reported", changed)
	}
	if mode, _, _ := s.Snapshot(); mode != ModeExplicit {
		t.Errorf("mode = %q, want explicit — a mode change must not need a restart", mode)
	}

	// Re-applying the same value is not a change, and reporting it as one would
	// train an operator to ignore the line.
	if changed := s.Apply(&explicit, nil); len(changed) != 0 {
		t.Errorf("changed = %v, want nothing for a no-op apply", changed)
	}
}

func TestSettingsIgnoreAnUnrecognisedMode(t *testing.T) {
	// It could be a newer, stricter setting this binary does not know. Running
	// under a mode whose meaning is unknown is worse than running under the old
	// one.
	s := NewSettings(ModeExplicit, time.Hour, true)
	bogus := "paranoid"
	if changed := s.Apply(&bogus, nil); len(changed) != 0 {
		t.Errorf("changed = %v, want an unrecognised mode ignored", changed)
	}
	if mode, _, _ := s.Snapshot(); mode != ModeExplicit {
		t.Errorf("mode = %q, want the previous value kept", mode)
	}
}

func TestSettingsSnapshotIsAtomicAcrossFields(t *testing.T) {
	// A decision that straddled an update would mix settings from two
	// configurations — one no admin ever authored.
	s := NewSettings(ModeObserve, time.Hour, true)
	done := make(chan struct{})
	go func() {
		defer close(done)
		explicit, age := "explicit", 60
		for i := 0; i < 200; i++ {
			s.Apply(&explicit, &age)
		}
	}()
	for i := 0; i < 200; i++ {
		mode, age, _ := s.Snapshot()
		if mode == ModeExplicit && age != 60*time.Second && age != time.Hour {
			t.Fatalf("snapshot mixed configurations: mode=%s age=%s", mode, age)
		}
	}
	<-done
}

func TestOnlyConfinementNeedsARestart(t *testing.T) {
	// The distinction the operator-facing message depends on: everything the
	// decider reads is read per decision, and only the seatbelt profile — applied
	// to a process at exec time — cannot change under a running harness.
	local := Local{Mode: "observe", Sandbox: "auto", MaxStatusAgeSeconds: -1}

	modeOnly := ApplyVerifiedConfig(local, PushedConfig{Mode: strPtr("explicit")})
	if modeOnly.PushedMode() == nil || *modeOnly.PushedMode() != "explicit" {
		t.Error("a mode change must be applicable live")
	}
	if got := modeOnly.NeedsRestart(); len(got) != 0 {
		t.Errorf("NeedsRestart = %v, want nothing — a mode change does not need one", got)
	}

	sandboxOnly := ApplyVerifiedConfig(local, PushedConfig{Sandbox: strPtr("require")})
	if sandboxOnly.PushedMode() != nil {
		t.Error("an unchanged mode must not be reported as changed")
	}
	if got := sandboxOnly.NeedsRestart(); len(got) != 1 {
		t.Errorf("NeedsRestart = %v, want the confinement change named", got)
	}

	ageOnly := ApplyVerifiedConfig(local, PushedConfig{MaxStatusAgeSeconds: intPtr(60)})
	if ageOnly.PushedMaxStatusAge() == nil || *ageOnly.PushedMaxStatusAge() != 60 {
		t.Error("a staleness-bound change must be applicable live")
	}
	if got := ageOnly.NeedsRestart(); len(got) != 0 {
		t.Errorf("NeedsRestart = %v, want nothing", got)
	}
}

func intPtr(i int) *int { return &i }
