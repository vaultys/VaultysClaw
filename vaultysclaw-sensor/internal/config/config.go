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

	Providers       []ProviderRule       `yaml:"providers"`
	LocalRuntimes   []RuntimeRule        `yaml:"localRuntimes"`
	MCPServers      []MCPRule            `yaml:"mcpServers"`
	AgentFrameworks []AgentFrameworkRule `yaml:"agentFrameworks"`
	BrowserProcess  []string             `yaml:"browserProcessNames"`
}

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
