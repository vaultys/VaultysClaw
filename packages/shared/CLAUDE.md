# packages/shared

Shared types, security utilities, and channel protocol definitions used by both the control plane and agent controller. Import via path alias `@vaultysclaw/shared`.

## Key Files

- **`src/types.ts`** — Core domain types, and the typed WebSocket message envelope: `WSMessageType`, `WSMessage`, all `WSRegister*`/`WSAuth*`/`WSProxy*` payloads, `VaultysIdentity`, `AgentCapability` enum, `ResourceLimits`, `AgentPolicy`, `SignedIntent`, `ExecutionResult` — all agent/proxy ↔ control-plane messages are defined here.
- **`src/channel-types.ts`** — A separate, unrelated feature: the in-app Slack-style collaboration channels (`Channel`, `ChannelMessage`, `ChannelBridge`, `ChannelEvent`) that agents and users post to. Not part of the WebSocket protocol envelope despite the similar name.
- **`src/security.ts`** — ECDSA signature helpers, VaultysId crypto utilities
- **`src/errors.ts`** — Shared error types

## Adding WebSocket Message Types

Add new message types to `src/types.ts` (`WSMessageType` + the payload interface), then handle them in:
- `packages/control-plane/lib/ws-server.ts` (control plane side)
- `packages/sdk/src/base-agent.ts` (agent/proxy side) — `packages/agent-controller/src/agent.ts` composes on top of this rather than handling the envelope directly

Both sides must be updated together — the types file is the single source of truth.

`WSChatMessagePayload` carries two per-conversation chat toggles set from the UI: `stream` (token-by-token) and `thinking` (request the model's reasoning). The chat flow threads them UI → `POST /api/agents/:did/chat-sessions` → `sendChatToAgent` → `chat_message` payload → agent `executeChat` → `streamChat`.
