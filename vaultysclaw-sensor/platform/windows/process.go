//go:build windows

package windows

import (
	"context"

	"github.com/vaultys/vaultysclaw-sensor/internal/collector"
)

// ProcessCollector collects process metadata via
// `Get-CimInstance Win32_Process`.
type ProcessCollector struct{}

func NewProcessCollector() *ProcessCollector { return &ProcessCollector{} }

type win32Process struct {
	ProcessId       int     `json:"ProcessId"`
	ParentProcessId int     `json:"ParentProcessId"`
	Name            string  `json:"Name"`
	ExecutablePath  *string `json:"ExecutablePath"`
	CommandLine     *string `json:"CommandLine"`
	CreationDate    *string `json:"CreationDate"`
}

type processUser struct {
	Id       int     `json:"Id"`
	UserName *string `json:"UserName"`
}

func (c *ProcessCollector) Processes(ctx context.Context) ([]collector.Process, error) {
	out, err := runPowerShell(ctx, `Get-CimInstance Win32_Process | `+
		`Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,CreationDate | `+
		`ConvertTo-Json -Compress`)
	if err != nil {
		return nil, err
	}
	items, err := decodeJSONArrayOrObject[win32Process](out)
	if err != nil {
		return nil, err
	}

	// Best-effort owning-user lookup; some processes may not resolve
	// without elevation. Failure here doesn't fail the whole collection.
	userByPID := map[int]string{}
	if userOut, uerr := runPowerShell(ctx, `Get-Process -IncludeUserName | `+
		`Select-Object Id,UserName | ConvertTo-Json -Compress`); uerr == nil {
		if users, err := decodeJSONArrayOrObject[processUser](userOut); err == nil {
			for _, u := range users {
				if u.UserName != nil {
					userByPID[u.Id] = *u.UserName
				}
			}
		}
	}

	procs := make([]collector.Process, 0, len(items))
	for _, p := range items {
		exe := ""
		if p.ExecutablePath != nil {
			exe = *p.ExecutablePath
		}
		cmd := ""
		if p.CommandLine != nil {
			cmd = *p.CommandLine
		}
		procs = append(procs, collector.Process{
			PID:        p.ProcessId,
			PPID:       p.ParentProcessId,
			Name:       p.Name,
			Executable: exe,
			Command:    cmd,
			User:       userByPID[p.ProcessId],
			StartTime:  parseCIMDate(p.CreationDate),
		})
	}
	return procs, nil
}
