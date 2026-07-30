//go:build windows

// Package windows implements collector.ProcessCollector and
// collector.NetworkCollector for Windows via PowerShell's CIM/NetTCPIP
// cmdlets (Get-CimInstance Win32_Process, Get-NetTCPConnection), each
// piped through ConvertTo-Json — no cgo, no WMI COM bindings, no admin
// privileges required for the commands themselves (some fields, like a
// process's owning user, may be empty without elevation; that degrades
// gracefully rather than failing collection).
//
// KNOWN LIMITATION: this implementation has not been run or verified on an
// actual Windows machine (none was available in the environment this was
// built in) — treat it as a best-effort starting point that needs real
// validation before production use.
package windows

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"time"
)

func runPowerShell(ctx context.Context, script string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("powershell: %w: %s", err, stderr.String())
	}
	return stdout.Bytes(), nil
}

// decodeJSONArrayOrObject handles ConvertTo-Json's quirk of emitting a bare
// object (not a one-element array) when a pipeline produces a single
// result.
func decodeJSONArrayOrObject[T any](data []byte) ([]T, error) {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return nil, nil
	}
	if trimmed[0] == '[' {
		var items []T
		if err := json.Unmarshal(trimmed, &items); err != nil {
			return nil, err
		}
		return items, nil
	}
	var one T
	if err := json.Unmarshal(trimmed, &one); err != nil {
		return nil, err
	}
	return []T{one}, nil
}

var cimDateRe = regexp.MustCompile(`/Date\((\d+)\)/`)

// parseCIMDate best-effort parses the handful of shapes PowerShell's
// ConvertTo-Json can produce for a [datetime] property, depending on
// PowerShell version. Returns the zero time if none match.
func parseCIMDate(s *string) time.Time {
	if s == nil || *s == "" {
		return time.Time{}
	}
	if m := cimDateRe.FindStringSubmatch(*s); m != nil {
		if ms, err := strconv.ParseInt(m[1], 10, 64); err == nil {
			return time.UnixMilli(ms)
		}
	}
	if t, err := time.Parse(time.RFC3339, *s); err == nil {
		return t
	}
	return time.Time{}
}
