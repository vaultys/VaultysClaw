package vconn

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// CapabilityState is the client's local record of the most recent successful
// service:"certificate" exchange (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b).
// The Challenger certificate it carries is a native, independently
// verifiable artifact — not session-bound like the auth handshake — so
// persisting it here (unlike the in-memory grant it's read into) means a
// process restart resumes with the same capabilities instead of losing them
// until an admin re-triggers delivery.
type CapabilityState struct {
	CertID       string   `json:"certId"`
	Certificate  string   `json:"certificate"`
	Capabilities []string `json:"capabilities"`
}

// loadCapabilityState reads persisted state from path, returning (nil, nil)
// if path is empty or the file doesn't exist yet — both are the normal
// "nothing granted so far" case, not an error.
func loadCapabilityState(path string) (*CapabilityState, error) {
	if path == "" {
		return nil, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("vconn: reading capability state: %w", err)
	}
	var state CapabilityState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("vconn: parsing capability state: %w", err)
	}
	return &state, nil
}

// saveCapabilityState writes state to path (mode 0600, matching the identity
// secret's own permissions), creating its parent directory if needed. A
// no-op when path is empty.
func saveCapabilityState(path string, state CapabilityState) error {
	if path == "" {
		return nil
	}
	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return fmt.Errorf("vconn: creating capability state directory: %w", err)
		}
	}
	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("vconn: encoding capability state: %w", err)
	}
	return os.WriteFile(path, data, 0o600)
}
