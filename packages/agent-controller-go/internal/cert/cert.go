// Package cert verifies the signed-cert wire format used by the control
// plane to sign intents (packages/policy/src/certs/codec.ts + sign.ts):
//
//	base64( 4-byte-LE bodyLen | msgpack(body) | raw-signature )
package cert

import (
	"encoding/base64"
	"fmt"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
	"github.com/vmihailenco/msgpack/v5"
)

// IntentBody mirrors packages/policy/src/certs/intent.ts's IntentCertBody.
type IntentBody struct {
	Type      string `msgpack:"type"`
	ID        string `msgpack:"id"`
	Action    string `msgpack:"action"`
	AgentID   string `msgpack:"agentId"`
	Timestamp int64  `msgpack:"timestamp"`
}

// unpack splits the base64 token into its msgpack body and raw signature.
func unpack(token string) (body []byte, signature []byte, err error) {
	combined, err := base64.StdEncoding.DecodeString(token)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid base64: %w", err)
	}
	if len(combined) < 5 {
		return nil, nil, fmt.Errorf("cert token too short")
	}
	bodyLen := uint32(combined[0]) | uint32(combined[1])<<8 | uint32(combined[2])<<16 | uint32(combined[3])<<24
	if uint32(len(combined)) < 4+bodyLen {
		return nil, nil, fmt.Errorf("cert token length mismatch")
	}
	body = combined[4 : 4+bodyLen]
	signature = combined[4+bodyLen:]
	return body, signature, nil
}

// VerifyIntent verifies an intent cert token against the server's VaultysID
// and cross-checks the decoded body's intentId/agentId, matching the agent-side
// stricter check in packages/sdk/src/intent-verify.ts.
func VerifyIntent(serverID *vaultysid.VaultysID, token, expectedIntentID, expectedAgentID string) (*IntentBody, error) {
	body, signature, err := unpack(token)
	if err != nil {
		return nil, err
	}

	if err := serverID.VerifyChallenge(body, signature); err != nil {
		return nil, fmt.Errorf("signature verification failed: %w", err)
	}

	var decoded IntentBody
	if err := msgpack.Unmarshal(body, &decoded); err != nil {
		return nil, fmt.Errorf("failed to decode cert body: %w", err)
	}

	if decoded.Type != "intent" {
		return nil, fmt.Errorf("unexpected cert type: %s", decoded.Type)
	}
	if decoded.ID != expectedIntentID {
		return nil, fmt.Errorf("intent id mismatch")
	}
	if decoded.AgentID != expectedAgentID {
		return nil, fmt.Errorf("agent id mismatch")
	}

	return &decoded, nil
}
