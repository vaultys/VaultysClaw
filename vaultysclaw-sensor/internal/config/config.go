// Package config loads and validates configuration for both the sensor and
// the reference collector. Provider/runtime/MCP detection rules are
// data, not code, so they can be extended per-deployment without touching
// detector logic.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// ProviderRule matches network destinations to a known AI provider.
type ProviderRule struct {
	Name  string   `yaml:"name"`
	Hosts []string `yaml:"hosts"`
}

// RuntimeRule matches processes/ports to a known local AI runtime.
type RuntimeRule struct {
	Name              string   `yaml:"name"`
	ProcessNames      []string `yaml:"processNames,omitempty"`
	CmdlineSubstrings []string `yaml:"cmdlineSubstrings,omitempty"`
	Ports             []int    `yaml:"ports,omitempty"`
}

// MCPRule matches processes/command lines to known MCP server patterns.
type MCPRule struct {
	Name              string   `yaml:"name"`
	CmdlineSubstrings []string `yaml:"cmdlineSubstrings,omitempty"`
}

// AppKind classifies what a matched AI application *is*, which decides how it
// is weighted: an assistant is AI usage, a harness is AI usage that also acts
// on the machine, an IDE merely has AI features that may or may not be in use.
type AppKind string

const (
	// AppKindAssistant is a chat/assistant surface — a desktop or CLI client
	// whose job is talking to a model (ChatGPT.app, Claude.app, Kimi, LM Studio's
	// chat UI). Strong AI evidence, no agent evidence on its own.
	AppKindAssistant AppKind = "assistant"
	// AppKindHarness is an agentic coding/automation harness — it reads and
	// writes files, runs commands and drives tool calls on the user's behalf
	// (Claude Code, Codex, Cursor's agent, OpenCode, aider, cline, goose).
	// Strong AI *and* strong agent evidence: this is the class the control
	// plane most needs to see.
	AppKindHarness AppKind = "harness"
	// AppKindIDE is an editor that ships AI features which may or may not be
	// active in this session (VS Code + Copilot, JetBrains AI). Weak on its
	// own — it only becomes interesting alongside provider connectivity.
	AppKindIDE AppKind = "ide"
)

// AppRule matches a locally-installed AI application — a desktop app, a CLI,
// or an editor — by process name, executable path, or command line.
//
// This is deliberately a separate catalog from LocalRuntimes (which serve
// models) and AgentFrameworks (which are libraries appearing in a command
// line). An installed app is the single most common thing an operator
// actually wants to see on a laptop, and it is detectable with no network
// visibility at all — which matters, because on macOS and Windows the OS
// hands us a bare IP for every connection and provider matching can fail
// entirely (see collector.ProviderIndex).
type AppRule struct {
	Name string  `yaml:"name"`
	Kind AppKind `yaml:"kind"`
	// ProcessNames are matched case-insensitively against the process's
	// basename, exactly.
	ProcessNames []string `yaml:"processNames,omitempty"`
	// ExecutableSubstrings are matched case-insensitively as substrings of the
	// full executable path. This is what catches an app's helper processes:
	// every child of ChatGPT.app still lives under ".../ChatGPT.app/", so one
	// entry covers the bundle instead of enumerating "Codex (Service)",
	// "Codex (Renderer)" and friends by name.
	ExecutableSubstrings []string `yaml:"executableSubstrings,omitempty"`
	// CmdlineSubstrings are matched case-insensitively against the full command
	// line — for CLIs invoked through an interpreter (`node .../cline`,
	// `python -m aider`) where neither the process name nor the executable path
	// says what is actually running.
	CmdlineSubstrings []string `yaml:"cmdlineSubstrings,omitempty"`
	// Priority lifts a rule above the built-ins, which are ordered
	// most-specific-first because the first match wins. Default 0; a positive
	// value is how a catalog's rule for a harness that ships inside some
	// vendor's bundle beats the built-in rule for that bundle, without having
	// to disable it.
	Priority int `yaml:"priority,omitempty"`
}

// AgentFrameworkRule matches command lines to known agent frameworks —
// a signal towards agent (not just AI) confidence.
type AgentFrameworkRule struct {
	Name              string   `yaml:"name"`
	CmdlineSubstrings []string `yaml:"cmdlineSubstrings,omitempty"`
}

// Sensor is the sensor daemon's configuration.
type Sensor struct {
	CollectorURL        string `yaml:"collectorUrl"`
	DeviceName          string `yaml:"deviceName"`
	ScanIntervalSeconds int    `yaml:"scanIntervalSeconds"`
	TelemetryEnabled    bool   `yaml:"telemetryEnabled"`
	Debug               bool   `yaml:"debug"`
	IdentityPath        string `yaml:"identityPath"`
	// AgentIdentityPath, if set, points at a locally-known VaultysId secret file
	// for a real agent (e.g. agent-controller's own identity, VAULTYS_ID_PATH) —
	// deliberately operator-configured, not auto-discovered, since there's no
	// safe portable way to read another process's own identity path choice.
	// When set and readable, its DID is attached as IdentityEvidence on any
	// workload whose classification matched a known agent framework, letting
	// the control plane correlate "this AI/agent workload is run by that
	// specific, already-registered Actor" (docs/vaultysclaw-integration.md §4)
	// instead of treating every detection as merely observed.
	AgentIdentityPath string `yaml:"agentIdentityPath"`
	// CatalogPath points at the detection rule catalog (see catalog.go): a
	// separate YAML file, merged additively over the built-in rules, and
	// re-read while the sensor runs so a newly-released harness can be covered
	// without a restart or a redeploy. A missing file means "built-ins only",
	// which is the default deployment.
	CatalogPath string `yaml:"catalogPath"`

	Providers       []ProviderRule       `yaml:"providers"`
	AIApplications  []AppRule            `yaml:"aiApplications"`
	LocalRuntimes   []RuntimeRule        `yaml:"localRuntimes"`
	MCPServers      []MCPRule            `yaml:"mcpServers"`
	AgentFrameworks []AgentFrameworkRule `yaml:"agentFrameworks"`
	BrowserProcess  []string             `yaml:"browserProcessNames"`
	// SupportProcess suppresses application matches on an app's own crash
	// reporters and updaters. See the catalog's supportProcessSubstrings.
	SupportProcess []string `yaml:"supportProcessSubstrings"`

	// Intercept configures the enforcement role. Disabled by default: a sensor
	// that has always been observe-only must not start refusing traffic because
	// it was upgraded (docs/PROXY_ARCHITECTURE.md §3.2).
	Intercept Intercept `yaml:"intercept"`

	// Supervise configures the harness-supervision role
	// (docs/HARNESS_SUPERVISOR.md). Like Intercept, off unless asked for.
	Supervise Supervise `yaml:"supervise"`
}

// Supervise configures the supervise role — tier-A tool-call governance for a
// coding harness (docs/HARNESS_SUPERVISOR.md §4).
//
// It shares Intercept's provisioning shape deliberately: the same pinned anchor,
// the same packcert grant, the same durable spool. A deployment running both
// roles points them at the same files and gets one policy and one audit trail,
// not two that can disagree.
type Supervise struct {
	Enabled bool `yaml:"enabled"`
	// Mode is "observe" (decide, record, always permit) or "explicit" (refuse
	// anything no certificate covers). Observe is the default and phase 0 ships
	// nothing else: the resource strings this role produces end up inside signed
	// certificates, so they are learned from real traffic before being frozen.
	Mode string `yaml:"mode"`
	// SocketPath is where the decision daemon listens. Owner-only, in an
	// owner-only directory — it is an authorization oracle with no
	// authentication of its own.
	SocketPath string `yaml:"socketPath"`
	// SettingsPath is where the generated harness settings file is written. It
	// belongs to the supervisor; the user's own harness settings are never
	// edited.
	SettingsPath string `yaml:"settingsPath"`
	// AnchorPath, ControlPlaneID, GrantPath, RuleSetPath, SpoolPath mirror
	// Intercept's fields exactly and mean exactly the same things. A host running
	// both roles points them at the same files: one grant, one rule set, one
	// spool, so the two roles cannot enforce two different policies.
	AnchorPath     string `yaml:"anchorPath"`
	ControlPlaneID string `yaml:"controlPlaneId"`
	GrantPath      string `yaml:"grantPath"`
	// RuleSetPath is the signed rule set. Optional: with none, the local safety
	// floor is the only deny source and certificates the only allow source.
	RuleSetPath string `yaml:"ruleSetPath"`
	SpoolPath   string `yaml:"spoolPath"`
	// MaxStatusAgeSeconds and FailClosed mirror Intercept's, including the
	// meaning of zero: it is the *strictest* value, not the loosest. See
	// Intercept.MaxStatusAgeSeconds for why, and do not let the two drift — one
	// knob must not mean opposite things in two roles of one binary.
	MaxStatusAgeSeconds int  `yaml:"maxStatusAgeSeconds"`
	FailClosed          bool `yaml:"failClosed"`
	// Sandbox enables tier-B OS confinement (docs/HARNESS_SUPERVISOR.md §6):
	// the safety floor and this supervisor's own artefacts, enforced by the
	// kernel rather than by a hook the agent can route around.
	//
	// "require" is the setting an operator who actually depends on confinement
	// should use: it refuses to launch on a platform or machine where it cannot
	// be established, rather than silently continuing in advisory mode. "auto"
	// confines where it can and warns loudly where it cannot; "off" never tries.
	Sandbox string `yaml:"sandbox"`
	// ControlPlaneURL, when set, makes the supervise role open a connection to
	// the control plane so it can receive actor_config pushes
	// (docs/PROXY_ARCHITECTURE.md §12). Empty keeps the role entirely
	// file-provisioned, which is a fully supported deployment and not a
	// degraded one: the pushed artefacts are verified against the same pinned
	// anchor either way, so a connection buys convenience, not authority.
	ControlPlaneURL string `yaml:"controlPlaneUrl"`
	// FloorPaths replaces the built-in safety floor when non-empty. Deny-only:
	// an entry can refuse a path but can never authorize one, which is the only
	// reason an unsigned local list is admissible here at all.
	FloorPaths []string `yaml:"floorPaths"`
}

// Supervision modes.
const (
	SuperviseObserve  = "observe"
	SuperviseExplicit = "explicit"
)

// Tier-B confinement settings.
const (
	SandboxOff     = "off"
	SandboxAuto    = "auto"
	SandboxRequire = "require"
)

// Intercept configures the intercept role — the tier-1 CONNECT proxy
// (docs/PROXY_ARCHITECTURE.md §2, §8).
//
// The observe role can run without any of this, and does by default. Turning
// Enabled on is what changes a component that cannot break the host into one
// that can, which is why it is opt-in here *and* gated on a capability the
// control plane must grant (§3.2).
type Intercept struct {
	Enabled bool `yaml:"enabled"`
	// ListenAddr is where the CONNECT proxy binds, e.g. "127.0.0.1:8888".
	// Loopback-only by default: a proxy reachable from the network is a very
	// different exposure than one only local processes can use.
	ListenAddr string `yaml:"listenAddr"`
	// Mode is how traffic reaches the proxy: "explicit" (agents are configured
	// to point here) or "system" (the host's proxy settings are pointed here).
	// Only "explicit" is implemented — "system" requires the attribution and
	// scope machinery of §5.2, without which it would govern the whole host.
	Mode string `yaml:"mode"`
	// AnchorPath is where the pinned control-plane identity lives (§8.1).
	AnchorPath string `yaml:"anchorPath"`
	// ControlPlaneID optionally provisions that anchor out of band, as standard
	// base64 of the control plane's VaultysId. Setting it removes the
	// trust-on-first-use window entirely.
	ControlPlaneID string `yaml:"controlPlaneId"`
	// GrantPath is the packcert capability-grant token authorizing this point.
	GrantPath string `yaml:"grantPath"`
	// RuleSetPath is the signed rule set (§5.2.0). Optional: with no rule set,
	// every request is decided by the certificate alone.
	RuleSetPath string `yaml:"ruleSetPath"`
	// SpoolPath is the durable audit spool (G7).
	SpoolPath string `yaml:"spoolPath"`
	// MaxStatusAgeSeconds bounds how long an unrefreshed certificate status may
	// back a decision (§7.1/§8.2).
	//
	// Zero is the *strictest* value, not the loosest — it means no cached status
	// is acceptable, which under FailClosed denies every governed request. This
	// mirrors `docs/CERTIFICATE_WEB_OF_TRUST.md` §5.2, where
	// `stapleTtlSeconds: 0` means "force live query every time"; an offline
	// decider cannot query live, so refusing is the faithful reading of that
	// choice. Negative means unbounded, and has to be written explicitly so it
	// can never be reached by leaving the field out.
	MaxStatusAgeSeconds int `yaml:"maxStatusAgeSeconds"`
	// FailClosed denies governed requests once MaxStatusAgeSeconds has elapsed.
	FailClosed bool `yaml:"failClosed"`
	// IdleTimeoutSeconds bounds how long an established tunnel may sit idle.
	// Zero leaves tunnels open indefinitely, which long-lived streaming
	// connections need.
	IdleTimeoutSeconds int `yaml:"idleTimeoutSeconds"`
}

// Interception modes. Only ModeExplicit is implemented; see Intercept.Mode.
const (
	ModeExplicit = "explicit"
	ModeSystem   = "system"
)

// Collector is the standalone reference collector's configuration.
type Collector struct {
	ListenAddr              string `yaml:"listenAddr"`
	SnapshotPath            string `yaml:"snapshotPath"`
	SnapshotIntervalSeconds int    `yaml:"snapshotIntervalSeconds"`
	IdentityPath            string `yaml:"identityPath"`
	Debug                   bool   `yaml:"debug"`
}

// DefaultSensorConfig returns a Sensor config with sane defaults and the
// built-in detection rule set applied, so the sensor is useful out of the box
// without requiring a hand-written config.
//
// The rules come from the embedded default-catalog.yaml, not from Go literals:
// see catalog_default.go for why. Operational defaults — paths, ports, the
// intercept and supervise roles — stay here, because they are settings rather
// than detection data and have no business being reloadable.
func DefaultSensorConfig() *Sensor {
	s := &Sensor{
		ScanIntervalSeconds: 30,
		TelemetryEnabled:    true,
		IdentityPath:        defaultPath(".vaultysclaw-sensor/identity.key"),
		CatalogPath:         defaultPath(".vaultysclaw-sensor/catalog.yaml"),
		Intercept: Intercept{
			// Enabled stays false: enabling enforcement is always a deliberate
			// act, never a consequence of upgrading an observe-only sensor.
			Enabled: false,
			// Loopback only. A CONNECT proxy reachable from the network is a
			// materially different exposure than one only local processes reach.
			ListenAddr:  "127.0.0.1:8888",
			Mode:        ModeExplicit,
			AnchorPath:  defaultPath(".vaultysclaw-sensor/control-plane-anchor.json"),
			GrantPath:   defaultPath(".vaultysclaw-sensor/grant.token"),
			RuleSetPath: defaultPath(".vaultysclaw-sensor/rules.token"),
			SpoolPath:   defaultPath(".vaultysclaw-sensor/audit.jsonl"),
			// FailClosed by default, which §7.1 argues is only tenable because
			// `explicit` mode governs exactly the agents pointed at this proxy
			// and nothing else on the host.
			FailClosed: true,
			// Unbounded by default, stated explicitly as a negative rather than left
			// at zero: with no control-plane push yet there is no status refresh to be
			// fresh against, and 0 would deny every request. Startup warns about it.
			MaxStatusAgeSeconds: -1,
		},
		Supervise: Supervise{
			// Off, and observe-only when on: the same deliberate-act rule as
			// Intercept, plus phase 0's own reason — the resource strings this
			// role produces end up inside signed certificates, so they are
			// learned before they are enforced.
			Enabled:      false,
			Mode:         SuperviseObserve,
			SocketPath:   defaultPath(".vaultysclaw-sensor/supervise.sock"),
			SettingsPath: defaultPath(".vaultysclaw-sensor/claude-settings.json"),
			// Shared with Intercept on purpose: one anchor, one grant, one
			// spool, so a host running both roles cannot enforce two policies.
			AnchorPath:  defaultPath(".vaultysclaw-sensor/control-plane-anchor.json"),
			GrantPath:   defaultPath(".vaultysclaw-sensor/grant.token"),
			RuleSetPath: defaultPath(".vaultysclaw-sensor/rules.token"),
			SpoolPath:   defaultPath(".vaultysclaw-sensor/audit.jsonl"),
			FailClosed:  true,
			// Unbounded, for the same reason and with the same startup warning
			// as Intercept: with no control-plane push yet there is no status
			// refresh to be fresh against, and 0 would deny everything.
			MaxStatusAgeSeconds: -1,
			// Auto by default: confinement where it can be established, and a
			// loud warning where it cannot. Not "require", because that would
			// make an upgrade start refusing to launch on a platform whose
			// backend is not built yet — the same rule that keeps Intercept
			// disabled by default.
			Sandbox: SandboxAuto,
		},
	}
	// Apply, not assignment: the same merge an operator's catalog goes through,
	// so the built-ins cannot take a path through the code that a deployment's
	// own rules never exercise.
	return s.Apply(DefaultCatalog())
}

// DefaultCollectorConfig returns sane defaults for the reference collector.
func DefaultCollectorConfig() *Collector {
	return &Collector{
		ListenAddr:              ":8443",
		SnapshotPath:            defaultPath(".vaultysclaw-collector/state.json"),
		SnapshotIntervalSeconds: 30,
		IdentityPath:            defaultPath(".vaultysclaw-collector/identity.secret"),
	}
}

// LoadSensorConfig reads a YAML file (if present) over the defaults, then
// applies VCS_* env var overrides, then validates.
func LoadSensorConfig(path string) (*Sensor, error) {
	cfg := DefaultSensorConfig()
	if path != "" {
		if err := loadYAMLOver(path, cfg); err != nil {
			return nil, err
		}
	}
	cfg.applyEnvOverrides()
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// LoadSensorRules loads config for its detection-rule fields only, skipping
// the operational validation Validate performs.
//
// The `catalog` subcommands inspect and validate detection rules, which has
// nothing to do with whether this machine is configured to report anywhere.
// Refusing to show an operator their rule set because collectorUrl is unset
// would make the tool useless exactly when it is most wanted: while writing a
// catalog, before the sensor is deployed.
func LoadSensorRules(path string) (*Sensor, error) {
	cfg := DefaultSensorConfig()
	if path != "" {
		if err := loadYAMLOver(path, cfg); err != nil {
			return nil, err
		}
	}
	cfg.applyEnvOverrides()
	return cfg, nil
}

// LoadCollectorConfig reads a YAML file (if present) over the defaults,
// then applies VCC_* env var overrides, then validates.
func LoadCollectorConfig(path string) (*Collector, error) {
	cfg := DefaultCollectorConfig()
	if path != "" {
		if err := loadYAMLOver(path, cfg); err != nil {
			return nil, err
		}
	}
	cfg.applyEnvOverrides()
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func loadYAMLOver(path string, out interface{}) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("config: reading %s: %w", path, err)
	}
	if err := yaml.Unmarshal(data, out); err != nil {
		return fmt.Errorf("config: parsing %s: %w", path, err)
	}
	return nil
}

func (s *Sensor) applyEnvOverrides() {
	if v := os.Getenv("VCS_COLLECTOR_URL"); v != "" {
		s.CollectorURL = v
	}
	if v := os.Getenv("VCS_DEVICE_NAME"); v != "" {
		s.DeviceName = v
	}
	if v := os.Getenv("VCS_SCAN_INTERVAL_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			s.ScanIntervalSeconds = n
		}
	}
	if v := os.Getenv("VCS_TELEMETRY_ENABLED"); v != "" {
		s.TelemetryEnabled = parseBool(v, s.TelemetryEnabled)
	}
	if v := os.Getenv("VCS_DEBUG"); v != "" {
		s.Debug = parseBool(v, s.Debug)
	}
	if v := os.Getenv("VCS_IDENTITY_PATH"); v != "" {
		s.IdentityPath = v
	}
	if v := os.Getenv("VCS_AGENT_IDENTITY_PATH"); v != "" {
		s.AgentIdentityPath = v
	}
	if v := os.Getenv("VCS_CATALOG_PATH"); v != "" {
		s.CatalogPath = v
	}
	if v := os.Getenv("VCS_INTERCEPT_ENABLED"); v != "" {
		s.Intercept.Enabled = parseBool(v, s.Intercept.Enabled)
	}
	if v := os.Getenv("VCS_INTERCEPT_LISTEN_ADDR"); v != "" {
		s.Intercept.ListenAddr = v
	}
	if v := os.Getenv("VCS_INTERCEPT_MODE"); v != "" {
		s.Intercept.Mode = v
	}
	if v := os.Getenv("VCS_INTERCEPT_CONTROL_PLANE_ID"); v != "" {
		s.Intercept.ControlPlaneID = v
	}
	if v := os.Getenv("VCS_INTERCEPT_GRANT_PATH"); v != "" {
		s.Intercept.GrantPath = v
	}
	if v := os.Getenv("VCS_INTERCEPT_RULESET_PATH"); v != "" {
		s.Intercept.RuleSetPath = v
	}
	if v := os.Getenv("VCS_INTERCEPT_MAX_STATUS_AGE_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			s.Intercept.MaxStatusAgeSeconds = n
		}
	}
	if v := os.Getenv("VCS_INTERCEPT_FAIL_CLOSED"); v != "" {
		s.Intercept.FailClosed = parseBool(v, s.Intercept.FailClosed)
	}
}

func (c *Collector) applyEnvOverrides() {
	if v := os.Getenv("VCC_LISTEN_ADDR"); v != "" {
		c.ListenAddr = v
	}
	if v := os.Getenv("VCC_SNAPSHOT_PATH"); v != "" {
		c.SnapshotPath = v
	}
	if v := os.Getenv("VCC_IDENTITY_PATH"); v != "" {
		c.IdentityPath = v
	}
	if v := os.Getenv("VCC_DEBUG"); v != "" {
		c.Debug = parseBool(v, c.Debug)
	}
}

// Validate rejects clearly-broken configuration. Notably: there is no way
// to disable TLS verification — that option is not exposed here at all.
func (s *Sensor) Validate() error {
	if s.TelemetryEnabled {
		if strings.TrimSpace(s.CollectorURL) == "" {
			return fmt.Errorf("config: collectorUrl is required when telemetryEnabled is true")
		}
		if !strings.HasPrefix(s.CollectorURL, "https://") && !strings.HasPrefix(s.CollectorURL, "http://localhost") && !strings.HasPrefix(s.CollectorURL, "http://127.0.0.1") {
			return fmt.Errorf("config: collectorUrl must use https:// (got %q)", s.CollectorURL)
		}
	}
	if s.ScanIntervalSeconds <= 0 {
		return fmt.Errorf("config: scanIntervalSeconds must be positive")
	}
	if strings.TrimSpace(s.IdentityPath) == "" {
		return fmt.Errorf("config: identityPath must not be empty")
	}
	if err := s.Intercept.validate(); err != nil {
		return err
	}
	return s.Supervise.validate()
}

// validate rejects a supervise configuration that would govern nothing while
// looking configured, or that asks for a mode this phase does not implement.
func (sv *Supervise) validate() error {
	if !sv.Enabled {
		return nil
	}
	switch sv.Mode {
	case SuperviseObserve:
	case SuperviseExplicit:
	default:
		return fmt.Errorf("config: supervise.mode must be %q or %q (got %q)", SuperviseObserve, SuperviseExplicit, sv.Mode)
	}
	switch sv.Sandbox {
	case SandboxOff, SandboxAuto, SandboxRequire:
	default:
		return fmt.Errorf("config: supervise.sandbox must be %q, %q or %q (got %q)", SandboxOff, SandboxAuto, SandboxRequire, sv.Sandbox)
	}
	for _, field := range []struct{ name, value string }{
		{"socketPath", sv.SocketPath},
		{"settingsPath", sv.SettingsPath},
		{"anchorPath", sv.AnchorPath},
		{"grantPath", sv.GrantPath},
		{"spoolPath", sv.SpoolPath},
	} {
		if strings.TrimSpace(field.value) == "" {
			return fmt.Errorf("config: supervise.%s is required when supervise.enabled is true", field.name)
		}
	}
	return nil
}

// validate rejects an intercept configuration that would enforce nothing while
// looking configured, or that asks for the unimplemented mode.
func (i *Intercept) validate() error {
	if !i.Enabled {
		return nil
	}
	if strings.TrimSpace(i.ListenAddr) == "" {
		return fmt.Errorf("config: intercept.listenAddr is required when intercept.enabled is true")
	}
	switch i.Mode {
	case ModeExplicit:
	case ModeSystem:
		// Refusing beats half-supporting: `system` mode sees all host traffic,
		// so without §5.2's attribution and workload-scope machinery it would
		// govern the browser and the package manager too.
		return fmt.Errorf(
			"config: intercept.mode %q is not implemented yet — it requires the attribution and workload-scope machinery of docs/PROXY_ARCHITECTURE.md §5.2; use %q",
			ModeSystem, ModeExplicit,
		)
	default:
		return fmt.Errorf("config: intercept.mode must be %q (got %q)", ModeExplicit, i.Mode)
	}
	if strings.TrimSpace(i.AnchorPath) == "" {
		return fmt.Errorf("config: intercept.anchorPath is required when intercept.enabled is true")
	}
	if strings.TrimSpace(i.GrantPath) == "" {
		return fmt.Errorf("config: intercept.grantPath is required when intercept.enabled is true")
	}
	if strings.TrimSpace(i.SpoolPath) == "" {
		return fmt.Errorf("config: intercept.spoolPath is required when intercept.enabled is true")
	}
	return nil
}

func (c *Collector) Validate() error {
	if strings.TrimSpace(c.ListenAddr) == "" {
		return fmt.Errorf("config: listenAddr must not be empty")
	}
	if strings.TrimSpace(c.SnapshotPath) == "" {
		return fmt.Errorf("config: snapshotPath must not be empty")
	}
	if strings.TrimSpace(c.IdentityPath) == "" {
		return fmt.Errorf("config: identityPath must not be empty")
	}
	return nil
}

func parseBool(v string, fallback bool) bool {
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func defaultPath(rel string) string {
	home, err := os.UserHomeDir()
	if err != nil {
		return rel
	}
	return home + string(os.PathSeparator) + rel
}
