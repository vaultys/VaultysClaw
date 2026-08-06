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
	ProcessNames      []string `yaml:"processNames"`
	CmdlineSubstrings []string `yaml:"cmdlineSubstrings"`
	Ports             []int    `yaml:"ports"`
}

// MCPRule matches processes/command lines to known MCP server patterns.
type MCPRule struct {
	Name              string   `yaml:"name"`
	CmdlineSubstrings []string `yaml:"cmdlineSubstrings"`
}

// AgentFrameworkRule matches command lines to known agent frameworks —
// a signal towards agent (not just AI) confidence.
type AgentFrameworkRule struct {
	Name              string   `yaml:"name"`
	CmdlineSubstrings []string `yaml:"cmdlineSubstrings"`
}

// BrowserProcessNames are executables treated as browsers: AI-site
// connections from these contribute to AI confidence but never to agent
// confidence.
var DefaultBrowserProcessNames = []string{
	"chrome", "google chrome", "chromium", "firefox", "safari",
	"msedge", "microsoft edge", "opera", "brave", "brave browser", "arc",
	"vivaldi",
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

	Providers       []ProviderRule       `yaml:"providers"`
	LocalRuntimes   []RuntimeRule        `yaml:"localRuntimes"`
	MCPServers      []MCPRule            `yaml:"mcpServers"`
	AgentFrameworks []AgentFrameworkRule `yaml:"agentFrameworks"`
	BrowserProcess  []string             `yaml:"browserProcessNames"`

	// Intercept configures the enforcement role. Disabled by default: a sensor
	// that has always been observe-only must not start refusing traffic because
	// it was upgraded (docs/PROXY_ARCHITECTURE.md §3.2).
	Intercept Intercept `yaml:"intercept"`
}

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

// DefaultSensorConfig returns a Sensor config with sane defaults and a
// baked-in provider/runtime/MCP/agent-framework rule set, so the sensor is
// useful out of the box without requiring a large hand-written config.
func DefaultSensorConfig() *Sensor {
	return &Sensor{
		ScanIntervalSeconds: 30,
		TelemetryEnabled:    true,
		IdentityPath:        defaultPath(".vaultysclaw-sensor/identity.key"),
		BrowserProcess:      DefaultBrowserProcessNames,
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
		Providers: []ProviderRule{
			{Name: "openai", Hosts: []string{"api.openai.com", "openai.com", "chatgpt.com", "chat.openai.com"}},
			{Name: "anthropic", Hosts: []string{"api.anthropic.com", "claude.ai", "anthropic.com"}},
			{Name: "azure_openai", Hosts: []string{".openai.azure.com"}},
			{Name: "google_gemini", Hosts: []string{"generativelanguage.googleapis.com", "gemini.google.com", "aiplatform.googleapis.com"}},
			// Deliberately not ".amazonaws.com" (bare) — that suffix matches
			// almost any AWS-hosted service (S3, CloudFront origins, etc.),
			// not just Bedrock, and would false-positive constantly.
			{Name: "aws_bedrock", Hosts: []string{"bedrock-runtime"}},
			{Name: "mistral", Hosts: []string{"api.mistral.ai", "chat.mistral.ai"}},
			{Name: "cohere", Hosts: []string{"api.cohere.ai", "api.cohere.com"}},
			{Name: "groq", Hosts: []string{"api.groq.com"}},
			{Name: "together_ai", Hosts: []string{"api.together.xyz", "api.together.ai"}},
			{Name: "openrouter", Hosts: []string{"openrouter.ai"}},
		},
		LocalRuntimes: []RuntimeRule{
			{Name: "ollama", ProcessNames: []string{"ollama"}, CmdlineSubstrings: []string{"ollama serve", "ollama run"}, Ports: []int{11434}},
			{Name: "lm_studio", ProcessNames: []string{"lms", "lm-studio", "lm studio"}, CmdlineSubstrings: []string{"lm-studio", "lms server"}, Ports: []int{1234}},
			// vllm/llama_cpp/localai deliberately have no Ports entry: 8000
			// and 8080 are extremely common generic dev-server ports
			// (uvicorn, arbitrary proxies/static servers, etc.) and would
			// weak-match constantly on unrelated processes. Name/cmdline
			// substrings for these are distinctive enough on their own.
			// "server" is also deliberately not in llama_cpp's process
			// names — it's a common generic binary/script name that would
			// otherwise produce a *strong* false match.
			{Name: "vllm", ProcessNames: []string{"vllm"}, CmdlineSubstrings: []string{"vllm.entrypoints", "vllm serve"}},
			{Name: "llama_cpp", ProcessNames: []string{"llama-server"}, CmdlineSubstrings: []string{"llama.cpp", "llama-server"}},
			{Name: "localai", ProcessNames: []string{"local-ai", "localai"}, CmdlineSubstrings: []string{"localai"}},
		},
		MCPServers: []MCPRule{
			{Name: "mcp_generic", CmdlineSubstrings: []string{"@modelcontextprotocol/", "mcp-server-", "mcp_server_"}},
			{Name: "mcp_filesystem", CmdlineSubstrings: []string{"server-filesystem"}},
			{Name: "mcp_github", CmdlineSubstrings: []string{"server-github", "github-mcp"}},
			{Name: "mcp_postgres", CmdlineSubstrings: []string{"server-postgres", "postgres-mcp"}},
			{Name: "claude_desktop", CmdlineSubstrings: []string{"Claude.app", "claude_desktop"}},
		},
		AgentFrameworks: []AgentFrameworkRule{
			{Name: "langchain", CmdlineSubstrings: []string{"langchain"}},
			{Name: "autogen", CmdlineSubstrings: []string{"autogen"}},
			{Name: "crewai", CmdlineSubstrings: []string{"crewai", "crew_ai"}},
			{Name: "mastra", CmdlineSubstrings: []string{"mastra"}},
			{Name: "agents_sdk", CmdlineSubstrings: []string{"openai-agents", "agents-sdk"}},
			// Deliberately not the bare substring "vaultysclaw" — that
			// matches any shell command that merely mentions a path
			// containing the repo/org name (e.g. `cd .../VaultysClaw`),
			// not just an actual agent-controller invocation.
			{Name: "vaultysclaw_agent", CmdlineSubstrings: []string{"agent-controller"}},
		},
	}
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
	return s.Intercept.validate()
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
