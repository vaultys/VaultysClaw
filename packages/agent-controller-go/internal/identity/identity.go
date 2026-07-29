// Package identity loads or generates the agent's VaultysID, matching the
// TypeScript convention in packages/sdk/src/base-agent.ts's initVaultysId:
// the identity file holds base64(type-byte || secret), a machine identity.
package identity

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
)

// Load reads the VaultysID from path, generating and persisting a new
// machine identity if the file does not exist yet.
func Load(path string) (*vaultysid.VaultysID, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create identity dir: %w", err)
	}

	if data, err := os.ReadFile(path); err == nil {
		secretStr := strings.TrimSpace(string(data))
		secret, err := base64.StdEncoding.DecodeString(secretStr)
		if err != nil {
			return nil, fmt.Errorf("failed to decode stored secret: %w", err)
		}
		id, err := vaultysid.FromSecret(secret)
		if err != nil {
			return nil, fmt.Errorf("failed to load identity: %w", err)
		}
		if err := id.ToVersion(1); err != nil {
			return nil, fmt.Errorf("failed to set identity version: %w", err)
		}
		return id, nil
	}

	id, err := vaultysid.GenerateMachine()
	if err != nil {
		return nil, fmt.Errorf("failed to generate identity: %w", err)
	}
	if err := id.ToVersion(1); err != nil {
		return nil, fmt.Errorf("failed to set identity version: %w", err)
	}

	secret, err := id.GetSecretString("base64")
	if err != nil {
		return nil, fmt.Errorf("failed to serialize new identity: %w", err)
	}
	if err := os.WriteFile(path, []byte(secret), 0o600); err != nil {
		return nil, fmt.Errorf("failed to persist identity: %w", err)
	}

	return id, nil
}
