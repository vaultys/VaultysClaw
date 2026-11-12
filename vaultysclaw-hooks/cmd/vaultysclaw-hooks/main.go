// Command vaultysclaw-hooks governs coding harnesses through their own hook
// systems: it installs a hook into each harness, and decides every tool call
// from the capability certificates the VaultysClaw control plane distributed.
//
//	vaultysclaw-hooks install   [--vendor=all] [--scope=user|machine] [--state=DIR] [--dry-run]
//	vaultysclaw-hooks uninstall [--vendor=all] [--scope=user|machine] [--state=DIR] [--dry-run]
//	vaultysclaw-hooks doctor    [--vendor=all] [--scope=user|machine] [--state=DIR]
//	vaultysclaw-hooks enroll    --url=URL --control-plane-id=BASE64 [--name=NAME] [--scope=…]
//	vaultysclaw-hooks agent     [--scope=…] [--state=…]   (long-running; a service at machine scope)
//	vaultysclaw-hooks hook      --vendor=V --event=E [--scope=…] [--state=…]   (run by the harness)
//
// See docs/HARNESS_HOOKS.md.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"

	"github.com/vaultys/VaultysClaw/sdk-go/toolgate"
	"github.com/vaultys/vaultysclaw-hooks/internal/agent"
	"github.com/vaultys/vaultysclaw-hooks/internal/doctor"
	"github.com/vaultys/vaultysclaw-hooks/internal/hook"
	"github.com/vaultys/vaultysclaw-hooks/internal/install"
	"github.com/vaultys/vaultysclaw-hooks/internal/state"

	// Adapters register themselves.
	_ "github.com/vaultys/vaultysclaw-hooks/internal/adapter/claudecode"
)

var version = "dev"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd, args := os.Args[1], os.Args[2:]
	switch cmd {
	case "hook":
		os.Exit(runHook(args))
	case "install", "uninstall", "doctor":
		os.Exit(runManage(cmd, args))
	case "enroll":
		os.Exit(runEnroll(args))
	case "agent":
		os.Exit(runAgent(args))
	case "version", "--version":
		fmt.Println("vaultysclaw-hooks", version)
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "vaultysclaw-hooks: unknown command %q\n", cmd)
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `usage: vaultysclaw-hooks <command> [flags]

commands:
  install     register hooks in each harness's settings
  uninstall   remove them
  doctor      report what is governed on this host, and how
  enroll      pin the control plane and create this host's identity
  agent       keep policy current from the control plane and ship the audit trail
  hook        handle one hook event (run by the harness, not by hand)
  version

common flags:
  --vendor=all|claude-code   which harnesses (default all)
  --scope=user|machine       user settings, or admin-managed settings (default user)
  --state=DIR                policy directory (default depends on scope and OS)
`)
}

type common struct {
	vendor, scope, stateDir string
}

func (c *common) bind(fs *flag.FlagSet) {
	fs.StringVar(&c.vendor, "vendor", "all", "harness vendor, comma list, or all")
	fs.StringVar(&c.scope, "scope", "user", "user or machine")
	fs.StringVar(&c.stateDir, "state", "", "state directory")
}

func (c *common) resolve() (state.Scope, string, error) {
	scope, err := state.ParseScope(c.scope)
	if err != nil {
		return "", "", err
	}
	dir := c.stateDir
	if dir == "" {
		if dir, err = state.DefaultDir(scope); err != nil {
			return "", "", err
		}
	}
	return scope, dir, nil
}

func runHook(args []string) int {
	fs := flag.NewFlagSet("hook", flag.ContinueOnError)
	var c common
	var event string
	c.bind(fs)
	fs.StringVar(&event, "event", "", "hook event name")
	if err := fs.Parse(args); err != nil {
		// A malformed installed command. Exit 0 so the harness is not wedged;
		// doctor reports the installation.
		return 0
	}
	scope, dir, err := c.resolve()
	if err != nil {
		fmt.Fprintln(os.Stderr, "vaultysclaw-hooks:", err)
		return 0
	}

	// The settings file that installs this very hook goes on the floor: an
	// agent able to edit it could switch the gate off.
	var extra []toolgate.FloorPath
	if ins, err := install.For(c.vendor); err == nil && len(ins) == 1 {
		if target, err := ins[0].Target(scope); err == nil {
			extra = append(extra, toolgate.FloorPath{Path: target, Reason: "the harness settings that install vaultysclaw-hooks"})
		}
	}

	return hook.Run(hook.Options{
		Vendor:   c.vendor,
		Event:    event,
		Paths:    state.PathsFor(scope, dir),
		ExtraOwn: extra,
		Stdin:    os.Stdin,
		Stdout:   os.Stdout,
		Stderr:   os.Stderr,
	})
}

func runManage(cmd string, args []string) int {
	fset := flag.NewFlagSet(cmd, flag.ExitOnError)
	var c common
	var dryRun bool
	var binary string
	c.bind(fset)
	fset.BoolVar(&dryRun, "dry-run", false, "print what would change")
	fset.StringVar(&binary, "binary", "", "path of the vaultysclaw-hooks executable harnesses should run (default: this one)")
	_ = fset.Parse(args)

	scope, dir, err := c.resolve()
	if err != nil {
		return fail(err)
	}
	if binary == "" {
		if binary, err = os.Executable(); err != nil {
			return fail(err)
		}
	}
	if binary, err = filepath.Abs(binary); err != nil {
		return fail(err)
	}
	if resolved, err := filepath.EvalSymlinks(binary); err == nil {
		binary = resolved
	}
	installers, err := install.For(c.vendor)
	if err != nil {
		return fail(err)
	}
	opts := install.Options{Scope: scope, Binary: binary, StateDir: dir, DryRun: dryRun}

	switch cmd {
	case "doctor":
		if !doctor.Run(opts, installers, os.Stdout) {
			return 1
		}
		return 0
	case "install":
		notes, err := install.EnsureStateDir(opts)
		if err != nil {
			return fail(err)
		}
		for _, n := range notes {
			fmt.Println(n)
		}
	}

	code := 0
	for _, in := range installers {
		var res install.Result
		var err error
		if cmd == "install" {
			res, err = in.Install(opts)
		} else {
			res, err = in.Uninstall(opts)
		}
		if err != nil {
			code = fail(fmt.Errorf("%s: %w", in.Vendor(), err))
			continue
		}
		verb := "unchanged"
		if res.Changed {
			verb = cmd + "ed"
		}
		fmt.Printf("%s: %s (%s)\n", res.Vendor, verb, res.Target)
		for _, n := range res.Notes {
			fmt.Println("  " + n)
		}
	}
	return code
}

func fail(err error) int {
	if errors.Is(err, fs.ErrPermission) {
		hint := "re-run with sudo"
		if runtime.GOOS == "windows" {
			hint = "re-run from an elevated (Administrator) prompt"
		}
		fmt.Fprintf(os.Stderr, "vaultysclaw-hooks: %v\n  machine scope writes system directories: %s\n", err, hint)
		return 1
	}
	fmt.Fprintln(os.Stderr, "vaultysclaw-hooks:", err)
	return 1
}

func runEnroll(args []string) int {
	fset := flag.NewFlagSet("enroll", flag.ExitOnError)
	var c common
	var coords agent.Coordinates
	c.bind(fset)
	fset.StringVar(&coords.URL, "url", "", "control plane address (ws://, wss://, http:// or https://)")
	fset.StringVar(&coords.ControlPlaneID, "control-plane-id", "", "the control plane's VaultysID, base64 (Settings → Control plane identity)")
	fset.StringVar(&coords.Name, "name", "", "name shown in the console (default: hostname)")
	_ = fset.Parse(args)

	scope, dir, err := c.resolve()
	if err != nil {
		return fail(err)
	}
	res, err := agent.Enroll(scope, state.PathsFor(scope, dir), coords)
	if err != nil {
		return fail(err)
	}
	fmt.Printf("enrolled\n  this host:     %s\n  control plane: %s\n\n", res.DID, res.AnchorDID)
	fmt.Println("next: start `vaultysclaw-hooks agent`, approve this registration in the console,")
	fmt.Println("      then issue it a packcert certificate (Certificates → Issue).")
	return 0
}

func runAgent(args []string) int {
	fset := flag.NewFlagSet("agent", flag.ExitOnError)
	var c common
	var verbose bool
	c.bind(fset)
	fset.BoolVar(&verbose, "verbose", false, "debug logging")
	_ = fset.Parse(args)

	scope, dir, err := c.resolve()
	if err != nil {
		return fail(err)
	}
	level := slog.LevelInfo
	if verbose {
		level = slog.LevelDebug
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if err := agent.Run(ctx, agent.Options{Scope: scope, Paths: state.PathsFor(scope, dir), Version: version, Logger: logger}); err != nil {
		return fail(err)
	}
	return 0
}
