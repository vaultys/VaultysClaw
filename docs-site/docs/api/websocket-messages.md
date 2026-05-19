---
sidebar_position: 11
title: WebSocket Message Reference
description: Quick reference for all WebSocket message types.
---

# WebSocket Message Reference

Quick reference table for all message types exchanged between agents and the control plane.

:::info Auth-challenge is the enforcement path
Capabilities and resource limits are embedded in the **VaultysId Challenger certificate** produced by the `auth_challenge` / `auth_complete` handshake — not delivered as a separate policy document. The `update_capabilities` message triggers a fresh handshake when a policy changes.
:::

---

## Agent → Control Plane

| Type | When sent | Key fields |
|---|---|---|
| `register` | Immediately after WS connect (new agent) | `name`, `publicKey`, `capabilities` |
| `result` | After executing an intent | `intentId`, `status`, `output`, `error` |
| `heartbeat` | Every 30 seconds | `uptime`, `memory`, `activeLlm`, `tokenUsage` |
| `tool_approval_request` | Agent needs human approval before using a tool | `requestId`, `toolName`, `args`, `conversationId` |
| `chat_message` | Streaming chat request from control plane UI | `conversationId`, `messages` |
| `chat_response` | Streaming LLM response chunk | `conversationId`, `chunk`, `done`, `error`, `errorCode` |
| `task_status` | Task queue status update | `taskId`, `status`, `result`, `error`, `action`, `retryCount` |
| `get_chat_sessions` | Request list of chat sessions | `limit` |
| `get_chat_history` | Request message history for a session | `sessionId` |

---

## Control Plane → Agent

| Type | When sent | Key fields |
|---|---|---|
| `auth_challenge` | Start (or restart) of auth handshake | `sessionId`, `data` (base64 cert) |
| `auth_complete` | Auth handshake succeeded | `agentId`, `did`, `capabilities` |
| `auth_failed` | Auth handshake failed | `reason` |
| `registration_pending` | New agent awaiting admin approval | `registrationId`, `message` |
| `registration_approved` | Admin approved a pending registration | `registrationId`, `capabilities` |
| `registration_rejected` | Admin rejected a pending registration | `registrationId`, `reason` |
| `update_capabilities` | Policy changed — triggers re-auth | `capabilities`, `resourceLimits`, `policyId`, `policyExpiresAt`, `reason` |
| `intent` | Route work to agent | `action`, `params`, `userDid` |
| `delegation_update` | Push delegation certificate changes | `delegations[]` |
| `agent_peer_catalog` | Push peer agent grant changes | `peers[]` |
| `tool_approval_response` | Admin decision on a tool approval | `requestId`, `approved`, `reason` |
| `llm_config` | Push LLM configuration | `config` (or `null` to revert to env vars) |
| `skills_config` | Push skill enable/disable configuration | `skills[]` |
| `task_enqueue` | Enqueue a task on the agent | `action`, `params`, `priority`, `scheduledAt`, `maxRetries` |
| `schedule_update` | Add or update a cron schedule | `id`, `name`, `cron`, `action`, `params`, `enabled` |
| `schedule_delete` | Remove a schedule | `id` |
| `chat_sessions_response` | Reply to `get_chat_sessions` | `sessions[]` |
| `chat_history_response` | Reply to `get_chat_history` | `sessionId`, `messages[]` |
| `pong` | Heartbeat acknowledgement | — |
| `error` | Protocol-level error | `code`, `message` |

---

## `update_capabilities` payload

This message is sent by the control plane whenever a policy is created or revoked for an agent. The agent stores the payload, sets `reAuthPending = true`, and waits for the subsequent `auth_challenge` to reissue the certificate.

```typescript
interface WSUpdateCapabilitiesPayload {
  /** Updated capability list. */
  capabilities: AgentCapability[];
  /** Runtime limits to embed in the new certificate. null clears existing limits. */
  resourceLimits?: ResourceLimits | null;
  /** ID of the authorising governance policy. null when revoked. */
  policyId?: string | null;
  /** ISO 8601 expiry. Agent rejects intents after this time. null = no expiry. */
  policyExpiresAt?: string | null;
  /** Human-readable reason (informational only). */
  reason?: string;
}
```

---

## `auth_challenge` / `auth_complete` — capability embedding

The `auth_complete` message carries `capabilities` in its payload as a convenience, but the authoritative source is the **co-signed Challenger certificate**. The agent reads governance metadata directly from `ctx.metadata.pk2`:

```typescript
// Inside handleAuthComplete (agent.ts)
const pk2 = ctx.metadata?.pk2;
this.resourceLimits  = pk2?.resourceLimits  ?? null;   // native ResourceLimits object
this.policyId        = pk2?.policyId        ?? null;   // string | null
this.policyExpiresAt = pk2?.policyExpiresAt ?? null;   // ISO 8601 string | null
```

All values are stored as native JavaScript types — no JSON parsing required.

---

## Deprecated messages

| Type | Status | Replacement |
|---|---|---|
| `policy_update` | **Deprecated** — kept as no-op for backward compatibility | `update_capabilities` + `auth_challenge` re-auth |
| `policy_ack` | **Deprecated** — no longer sent | — |

The `policy_update` message was the old mechanism for pushing signed policy documents to agents. It has been superseded by the certificate-embedding approach, which is tamper-evident and offline-verifiable.
