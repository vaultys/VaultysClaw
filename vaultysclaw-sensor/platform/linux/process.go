//go:build linux

// Package linux implements collector.ProcessCollector and
// collector.NetworkCollector for Linux using /proc only — no cgo, no
// netlink sockets, no elevated privileges required. Visibility into other
// users' processes/sockets is limited by normal /proc permissions and
// degrades gracefully (skipped, not escalated).
package linux

import (
	"context"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
)

// ProcessCollector collects process metadata from /proc.
type ProcessCollector struct {
	once      sync.Once
	clockTick float64
}

func NewProcessCollector() *ProcessCollector { return &ProcessCollector{} }

func (c *ProcessCollector) tick() float64 {
	c.once.Do(func() {
		c.clockTick = 100 // conventional Linux default (USER_HZ)
		out, err := exec.Command("getconf", "CLK_TCK").Output()
		if err == nil {
			if v, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64); err == nil && v > 0 {
				c.clockTick = v
			}
		}
	})
	return c.clockTick
}

func bootTime() (time.Time, error) {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return time.Time{}, err
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "btime ") {
			fields := strings.Fields(line)
			if len(fields) != 2 {
				continue
			}
			sec, err := strconv.ParseInt(fields[1], 10, 64)
			if err != nil {
				continue
			}
			return time.Unix(sec, 0), nil
		}
	}
	return time.Time{}, os.ErrNotExist
}

var userCache sync.Map // uid string -> username string

func lookupUser(uid string) string {
	if v, ok := userCache.Load(uid); ok {
		return v.(string)
	}
	name := uid
	if u, err := user.LookupId(uid); err == nil {
		name = u.Username
	}
	userCache.Store(uid, name)
	return name
}

// Processes lists running processes by scanning /proc/[0-9]+. Individual
// per-process read failures (process exited mid-scan, or belongs to
// another user and /proc restricts it) are skipped rather than failing the
// whole collection.
func (c *ProcessCollector) Processes(ctx context.Context) ([]collector.Process, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, err
	}
	btime, bootErr := bootTime()
	tick := c.tick()

	procs := make([]collector.Process, 0, len(entries))
	for _, e := range entries {
		select {
		case <-ctx.Done():
			return procs, ctx.Err()
		default:
		}

		pid, err := strconv.Atoi(e.Name())
		if err != nil {
			continue
		}
		base := filepath.Join("/proc", e.Name())

		status, err := readStatus(filepath.Join(base, "status"))
		if err != nil {
			continue // process likely exited between readdir and read
		}
		cmd := readCmdline(filepath.Join(base, "cmdline"))
		exe, _ := os.Readlink(filepath.Join(base, "exe")) // best-effort; empty on permission denied

		name := status["Name"]
		ppid, _ := strconv.Atoi(status["PPid"])
		uidField := strings.Fields(status["Uid"])
		uid := ""
		if len(uidField) > 0 {
			uid = uidField[0]
		}

		startTime := time.Time{}
		if bootErr == nil {
			if ticks, err := readStartTimeTicks(filepath.Join(base, "stat")); err == nil {
				startTime = btime.Add(time.Duration(float64(ticks)/tick) * time.Second)
			}
		}

		procs = append(procs, collector.Process{
			PID:        pid,
			PPID:       ppid,
			Name:       name,
			Executable: exe,
			Command:    cmd,
			User:       lookupUser(uid),
			StartTime:  startTime,
		})
	}
	return procs, nil
}

func readStatus(path string) (map[string]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	m := make(map[string]string)
	for _, line := range strings.Split(string(data), "\n") {
		idx := strings.IndexByte(line, ':')
		if idx == -1 {
			continue
		}
		m[line[:idx]] = strings.TrimSpace(line[idx+1:])
	}
	return m, nil
}

func readCmdline(path string) string {
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return ""
	}
	parts := strings.Split(strings.TrimRight(string(data), "\x00"), "\x00")
	return strings.TrimSpace(strings.Join(parts, " "))
}

// readStartTimeTicks parses field 22 (starttime, in clock ticks since
// boot) out of /proc/[pid]/stat. The comm field (originally field 2) can
// itself contain spaces or parentheses, so we locate it by its outermost
// parens rather than by naive whitespace splitting.
func readStartTimeTicks(path string) (uint64, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	s := string(data)
	open := strings.IndexByte(s, '(')
	close := strings.LastIndexByte(s, ')')
	if open == -1 || close == -1 || close < open {
		return 0, os.ErrInvalid
	}
	rest := strings.Fields(s[close+1:])
	// rest[0] = state (original field 3); starttime is original field 22,
	// so its index here is 22-3 = 19.
	const startTimeIdx = 19
	if len(rest) <= startTimeIdx {
		return 0, os.ErrInvalid
	}
	return strconv.ParseUint(rest[startTimeIdx], 10, 64)
}
