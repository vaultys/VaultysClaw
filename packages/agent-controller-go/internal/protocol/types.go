// Package protocol defines the JSON WebSocket envelope shared with the
// TypeScript control plane (packages/shared/src/types.ts). Field names and
// casing must match exactly since messages are JSON, not msgpack.
package protocol

import "encoding/json"

// Message is the generic envelope for every control-plane <-> agent message.
type Message struct {
	MessageID string          `json:"messageId"`
	Type      string          `json:"type"`
	AgentID   string          `json:"agentId,omitempty"`
	Payload   json.RawMessage `json:"payload"`
	Timestamp string          `json:"timestamp"`
	Signature string          `json:"signature,omitempty"`
}

type RegisterRequestPayload struct {
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
	Kind    string `json:"kind,omitempty"`
}

type AuthChallengePayload struct {
	SessionID    string   `json:"sessionId"`
	Data         string   `json:"data,omitempty"`
	Name         string   `json:"name,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
}

type AuthCompletePayload struct {
	AgentID      string   `json:"agentId"`
	DID          string   `json:"did"`
	Capabilities []string `json:"capabilities"`
}

type AuthFailedPayload struct {
	Reason string `json:"reason"`
}

type RegistrationPendingPayload struct {
	RegistrationID string `json:"registrationId"`
	Message        string `json:"message"`
}

type UpdateCapabilitiesPayload struct {
	Capabilities     []string        `json:"capabilities"`
	ResourceLimits   json.RawMessage `json:"resourceLimits,omitempty"`
	PolicyID         *string         `json:"policyId,omitempty"`
	PolicyExpiresAt  *string         `json:"policyExpiresAt,omitempty"`
}

type IntentPayload struct {
	ID        string          `json:"id"`
	Action    string          `json:"action"`
	Params    json.RawMessage `json:"params"`
	Timestamp int64           `json:"timestamp"`
	UserDID   string          `json:"userDid,omitempty"`
}

type ExecutionResult struct {
	IntentID   string      `json:"intentId"`
	Status     string      `json:"status"` // "success" | "failed" | "pending"
	Output     interface{} `json:"output,omitempty"`
	Error      string      `json:"error,omitempty"`
	ExecutedAt string      `json:"executedAt"`
}

type AckPayload struct {
	MessageID string `json:"messageId"`
	Success   bool   `json:"success"`
	Reason    string `json:"reason,omitempty"`
}

type HeartbeatPayload struct {
	Uptime float64                `json:"uptime"`
	Name   string                 `json:"name"`
	Memory map[string]interface{} `json:"memory,omitempty"`
}
