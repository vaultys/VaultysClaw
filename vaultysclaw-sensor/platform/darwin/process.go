//go:build darwin

// Package darwin implements the collector.ProcessCollector and
// collector.NetworkCollector interfaces for macOS using standard command
// line tools (ps, lsof) — no cgo, no private frameworks, no elevated
// privileges required. Visibility is therefore best-effort: lsof/ps only
// see what the invoking user is permitted to see (their own processes,
// plus whatever else the OS exposes without sudo).
package darwin

import (
	"bufio"
	"context"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
)

// ProcessCollector collects process metadata via `ps`.
type ProcessCollector struct{}

func NewProcessCollector() *ProcessCollector { return &ProcessCollector{} }

var (
	basicLineRe = regexp.MustCompile(`^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$`)
	cmdLineRe   = regexp.MustCompile(`^\s*(\d+)\s+(.*)$`)
)

// Processes lists running processes. It issues two `ps` invocations: one
// for fixed-width fields (pid/ppid/user/elapsed/comm) and one for the full
// command line, which BSD ps always renders last-and-unbounded — that's
// what lets this stay a simple two-pass regex parse even though comm/args
// can themselves contain spaces (e.g. "Google Chrome").
func (c *ProcessCollector) Processes(ctx context.Context) ([]collector.Process, error) {
	basic, err := runPS(ctx, "-axwwo", "pid=,ppid=,user=,etime=,comm=")
	if err != nil {
		return nil, err
	}
	cmds, err := runPS(ctx, "-axwwo", "pid=,command=")
	if err != nil {
		// Degrade gracefully: keep basic process info without full command lines.
		cmds = nil
	}

	cmdByPID := make(map[int]string, len(cmds))
	for _, line := range cmds {
		m := cmdLineRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		pid, err := strconv.Atoi(m[1])
		if err != nil {
			continue
		}
		cmdByPID[pid] = strings.TrimSpace(m[2])
	}

	now := time.Now()
	procs := make([]collector.Process, 0, len(basic))
	for _, line := range basic {
		m := basicLineRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		pid, err := strconv.Atoi(m[1])
		if err != nil {
			continue
		}
		ppid, _ := strconv.Atoi(m[2])
		user := m[3]
		etime := m[4]
		comm := strings.TrimSpace(m[5])

		cmd := cmdByPID[pid]

		procs = append(procs, collector.Process{
			PID:  pid,
			PPID: ppid,
			Name: baseName(comm),
			// comm is macOS ps's own idea of "the executable that was run",
			// and (unlike naively splitting Command on whitespace) it's
			// already correct even when the path itself contains spaces
			// (e.g. "/Applications/Google Chrome.app/.../Google Chrome").
			Executable: comm,
			Command:    cmd,
			User:       user,
			StartTime:  now.Add(-parseElapsed(etime)),
		})
	}
	return procs, nil
}

func runPS(ctx context.Context, args ...string) ([]string, error) {
	cmd := exec.CommandContext(ctx, "ps", args...)
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var lines []string
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		lines = append(lines, line)
	}
	return lines, nil
}

func baseName(path string) string {
	if idx := strings.LastIndex(path, "/"); idx != -1 {
		return path[idx+1:]
	}
	return path
}

// parseElapsed parses BSD ps's "etime" format: [[dd-]hh:]mm:ss
func parseElapsed(s string) time.Duration {
	s = strings.TrimSpace(s)
	var days, hours, mins, secs int
	if idx := strings.Index(s, "-"); idx != -1 {
		days, _ = strconv.Atoi(s[:idx])
		s = s[idx+1:]
	}
	parts := strings.Split(s, ":")
	switch len(parts) {
	case 3:
		hours, _ = strconv.Atoi(parts[0])
		mins, _ = strconv.Atoi(parts[1])
		secs, _ = strconv.Atoi(parts[2])
	case 2:
		mins, _ = strconv.Atoi(parts[0])
		secs, _ = strconv.Atoi(parts[1])
	case 1:
		secs, _ = strconv.Atoi(parts[0])
	}
	return time.Duration(days)*24*time.Hour +
		time.Duration(hours)*time.Hour +
		time.Duration(mins)*time.Minute +
		time.Duration(secs)*time.Second
}
