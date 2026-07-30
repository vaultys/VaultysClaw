//go:build darwin

package darwin

import (
	"testing"
	"time"
)

func TestParseElapsed(t *testing.T) {
	cases := []struct {
		in   string
		want time.Duration
	}{
		{"00:05", 5 * time.Second},
		{"02:30", 2*time.Minute + 30*time.Second},
		{"01:02:30", time.Hour + 2*time.Minute + 30*time.Second},
		{"3-01:02:30", 3*24*time.Hour + time.Hour + 2*time.Minute + 30*time.Second},
	}
	for _, c := range cases {
		if got := parseElapsed(c.in); got != c.want {
			t.Errorf("parseElapsed(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestBaseName(t *testing.T) {
	if got := baseName("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"); got != "Google Chrome" {
		t.Errorf("baseName() = %q, want %q", got, "Google Chrome")
	}
	if got := baseName("python3"); got != "python3" {
		t.Errorf("baseName() = %q, want %q", got, "python3")
	}
}
