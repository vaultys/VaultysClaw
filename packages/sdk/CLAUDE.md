# packages/sdk

The VaultysClaw SDK — the framework-agnostic base every VaultysClaw-connected
process is built on: VaultysId identity, control-plane connection, and policy
engine execution. Import via `@vaultysclaw/sdk`.

## What lives here

- **`src/base-agent.ts`** — `BaseAgentRuntime` (abstract `EventEmitter`): loads
  or generates the local VaultysId (`initVaultysId`), connects to the control
  plane over WebSocket or PeerJS/WebRTC (`connect()` picks the transport based
  on `peerjsControlPlaneId`), and drives the full handshake — `register` →
  `pending_approval` (unknown DID) → admin approval → `auth_complete` /
  `connected`. Composes `@vaultysclaw/policy`'s `PolicyEnforcer` to gate every
  intent (capability/governance rule → policy expiry → daily token budget →
  hourly request rate) before it reaches your handler.
- **`src/config.ts`** — `AgentRuntimeConfig`: name, control-plane URLs, PeerJS
  options, `vaultysIdPath`, `requestedCapabilities`.
- **`src/intent-verify.ts`** — `verifyIntentMessage`, a thin wrapper over
  `@vaultysclaw/policy`'s cert layer for verifying a signed intent.
- **`src/peer-grant-verify.ts`** — `verifyPeerGrant`, same pattern for peer-grant
  certs.
- **`src/peer-manager.ts`** — `PeerManager` / `peerIdForDid`: WebRTC
  peer-to-peer agent-to-agent invocation (`invokePeer`).

## Extending it

Subclass `BaseAgentRuntime` and implement the two abstract methods:

- `executeIntent(action, params, callerDid?, intentId?)` — handle a structured
  action; the base class has already run every policy gate.
- `executeChat(messages, conversationId, sendChunk)` — handle a chat session,
  streaming text back via `sendChunk`.

Override the `protected` hooks (`onAuthComplete`, `onDelegationUpdate`,
`onPeerCatalogUpdated`, `onLlmConfig`, `onSkillsConfig`, `onKnowledgeSources`,
`getDailyTokenUsageForBudget`) to react to control-plane pushes without
touching the protocol layer. See
[`docs-site/docs/guides/custom-agent-runtime.md`](../../docs-site/docs/guides/custom-agent-runtime.md)
for a full build-your-own walkthrough, including the WebRTC/Node polyfill
requirement (`@vaultysclaw/sdk` deliberately does not install one itself).

## Who consumes it

- `packages/agent-controller` — the full LLM-driven agent host (Mastra, tools,
  skills, memory) built on top.
- `packages/mcp-gateway` — a minimal embedding (`McpGatewayAgent extends
  BaseAgentRuntime`) that bridges peer agents into the MCP tool namespace.
- Any custom integration — a proxy/gateway, a rules-based system, a
  human-in-the-loop workflow, or another LLM framework entirely.

## Design rules

- **Framework-agnostic.** No LLM, tool, or skill concepts here — those belong
  in `agent-controller`. This package only knows identity, transport, auth,
  and policy gating.
- **No bundled WebRTC polyfill.** The caller's entry point must polyfill the
  RTC globals before importing anything else (see the custom-agent-runtime
  guide) — this keeps the SDK usable on any platform/binding.
- Both sides of a channel-protocol change must move together — see
  [`@vaultysclaw/shared`](../shared)'s note on `channel-types.ts` being the
  single source of truth; update `lib/ws-server.ts` on the control-plane side
  in the same change.

## Testing

`__tests__/base-agent-auth.test.ts` (repo root `__tests__/`) covers the auth
handshake against a real `Challenger`/`VaultysId` — regression coverage for
`serverPublicKey` extraction after auth completes. Run via the repo-root
`pnpm test`; no dedicated per-package vitest config (unlike `policy`).
