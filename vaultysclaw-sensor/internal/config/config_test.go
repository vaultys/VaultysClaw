package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultSensorConfig_IsValid(t *testing.T) {
	cfg := DefaultSensorConfig()
	cfg.CollectorURL = "https://collector.example.com"
	if err := cfg.Validate(); err != nil {
		t.Fatalf("expected default config (with URL filled in) to validate, got %v", err)
	}
}

func TestSensorValidate_RejectsMissingCollectorURLWhenTelemetryEnabled(t *testing.T) {
	cfg := DefaultSensorConfig()
	cfg.TelemetryEnabled = true
	cfg.CollectorURL = ""
	if err := cfg.Validate(); err == nil {
		t.Error("expected an error for missing collectorUrl")
	}
}

func TestSensorValidate_RejectsNonHTTPSCollectorURL(t *testing.T) {
	cfg := DefaultSensorConfig()
	cfg.CollectorURL = "http://collector.example.com"
	if err := cfg.Validate(); err == nil {
		t.Error("expected an error for a non-https, non-localhost collectorUrl")
	}
}

func TestSensorValidate_AllowsLocalhostHTTP(t *testing.T) {
	cfg := DefaultSensorConfig()
	cfg.CollectorURL = "http://localhost:8443"
	if err := cfg.Validate(); err != nil {
		t.Errorf("expected localhost http:// to be allowed for local testing, got %v", err)
	}
}

func TestSensorValidate_TelemetryDisabledSkipsURLCheck(t *testing.T) {
	cfg := DefaultSensorConfig()
	cfg.TelemetryEnabled = false
	cfg.CollectorURL = ""
	if err := cfg.Validate(); err != nil {
		t.Errorf("expected telemetryEnabled=false to skip the URL check, got %v", err)
	}
}

func TestLoadSensorConfig_EnvOverridesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(path, []byte("collectorUrl: https://from-file.example.com\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("VCS_COLLECTOR_URL", "https://from-env.example.com")

	cfg, err := LoadSensorConfig(path)
	if err != nil {
		t.Fatalf("LoadSensorConfig: %v", err)
	}
	if cfg.CollectorURL != "https://from-env.example.com" {
		t.Errorf("expected env var to override file value, got %s", cfg.CollectorURL)
	}
}

func TestLoadSensorConfig_MissingFile_FailsClosedWithoutCollectorConfigured(t *testing.T) {
	// Telemetry defaults to enabled, so a fresh install with no config
	// file and no collector URL must fail validation rather than silently
	// running with telemetry half-configured.
	_, err := LoadSensorConfig(filepath.Join(t.TempDir(), "does-not-exist.yaml"))
	if err == nil {
		t.Fatal("expected an error when telemetry is enabled but no collector is configured")
	}
}

func TestLoadSensorConfig_MissingFile_UsesBakedInDefaultsOnceConfigured(t *testing.T) {
	t.Setenv("VCS_COLLECTOR_URL", "https://collector.example.com")

	cfg, err := LoadSensorConfig(filepath.Join(t.TempDir(), "does-not-exist.yaml"))
	if err != nil {
		t.Fatalf("expected a missing config file to be tolerated once required fields are set via env, got %v", err)
	}
	if len(cfg.Providers) == 0 {
		t.Error("expected baked-in default provider rules")
	}
}

func TestDefaultCollectorConfig_IsValid(t *testing.T) {
	cfg := DefaultCollectorConfig()
	if err := cfg.Validate(); err != nil {
		t.Fatalf("expected default collector config to validate, got %v", err)
	}
}
