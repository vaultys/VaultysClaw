// Command agent-controller is a minimal, dependency-light VaultysClaw agent:
// it connects to the control plane over WebSocket, authenticates via the
// VaultysID Challenger handshake, and executes intents. It has no LLM, tool,
// or skill support — see packages/agent-controller for the full Node runtime.
package main

import (
	"encoding/json"
	"log"
	"os"

	"github.com/vaultys/vaultysclaw/agent-controller-go/internal/agent"
	"github.com/vaultys/vaultysclaw/agent-controller-go/internal/identity"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	name := env("AGENT_NAME", "go-agent")
	wsURL := env("CONTROL_PLANE_WS_URL", "ws://localhost:8080")
	idPath := env("VAULTYS_ID_PATH", "./vaultys-id.secret")

	vid, err := identity.Load(idPath)
	if err != nil {
		log.Fatalf("failed to load identity: %v", err)
	}
	log.Printf("identity ready — did: %s", vid.DID())

	rt := agent.New(agent.Config{
		Name:              name,
		ControlPlaneWsURL: wsURL,
		VaultysID:         vid,
		Capabilities:      []string{},
		OnIntent:          handleIntent,
	})

	rt.Run()
}

// handleIntent is a placeholder execution loop: it echoes the action and
// params back as output. Replace with real tool dispatch as needed.
func handleIntent(action string, params json.RawMessage, userDID string) (interface{}, error) {
	return map[string]interface{}{
		"echo":   action,
		"params": json.RawMessage(params),
	}, nil
}
