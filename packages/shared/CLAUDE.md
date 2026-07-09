# packages/shared

Shared types, security utilities, and channel protocol definitions used by both the control plane and agent controller. Import via path alias `@vaultysclaw/shared`.

## Key Files

- **`src/types.ts`** — Core domain types: `VaultysIdentity`, `AgentCapability` enum, `ResourceLimits`, `AgentPolicy`, `SignedIntent`, `ExecutionResult`
- **`src/channel-types.ts`** — Typed WebSocket message envelope; all agent ↔ control-plane messages are defined here
- **`src/security.ts`** — ECDSA signature helpers, VaultysId crypto utilities
- **`src/errors.ts`** — Shared error types

## Adding WebSocket Message Types

Add new message types to `src/channel-types.ts`, then handle them in:
- `packages/control-plane/lib/ws-server.ts` (control plane side)
- `packages/agent-controller/src/agent.ts` (agent side)

Both sides must be updated together — the types file is the single source of truth.

`WSChatMessagePayload` carries two per-conversation chat toggles set from the UI: `stream` (token-by-token) and `thinking` (request the model's reasoning). The chat flow threads them UI → `POST /api/agents/:did/chat-sessions` → `sendChatToAgent` → `chat_message` payload → agent `executeChat` → `streamChat`.
