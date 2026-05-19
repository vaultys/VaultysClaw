---
sidebar_position: 7
title: AI Governance
description: How to use the Governance dashboard to manage policies, resource limits, and audit trails.
---

# AI Governance

Vaultys Claw provides a built-in governance layer that lets you control **what** agents can do, **how much** they can consume, and **when** their permissions expire — all enforced cryptographically inside the agent's identity certificate.

---

## Overview

The **Governance** dashboard (sidebar → *Governance*) gives a platform-wide view across all agents:

| Panel | What it shows |
|---|---|
| Posture overview | Active agents, policy coverage %, agents with no policy, intents blocked vs allowed |
| Policies & Budgets | Create/revoke policies per agent or realm; view active resource limits |
| Audit Log | Unified timeline of auth events, connection changes, and intent outcomes |

Individual agents also have a dedicated **Governance tab** on their detail page, showing only that agent's active policies.

---

## Creating a policy

A policy grants an agent a set of capabilities and optionally attaches resource limits. You can create one from:

- **Governance dashboard → Policies & Budgets tab → New Policy**
- **Agent detail page → Governance tab → New Policy**
- **REST API:** `POST /api/policies`

### Required fields

| Field | Description |
|---|---|
| `agentDid` | DID of the target agent (required unless realm-scoped) |
| `capabilities` | One or more capabilities to grant |

### Optional fields

| Field | Description |
|---|---|
| `resourceLimits.maxTokensPerDay` | Maximum LLM tokens (prompt + completion) per calendar day |
| `resourceLimits.maxRequestsPerHour` | Maximum intent executions per rolling 60-minute window |
| `resourceLimits.allowedDomains` | Advisory list of permitted outbound domains |
| `expiresAt` | ISO 8601 timestamp after which the agent blocks all intents |

### What happens on save

1. The policy record is written to the database.
2. The control plane sends an `update_capabilities` WebSocket message to the agent (if connected).
3. A new [VaultysId Challenger](/docs/security/vaultys-id) handshake is initiated — capabilities and resource limits are embedded as native values in the co-signed certificate.
4. The agent reads the metadata from the certificate and starts enforcing the limits immediately.

If the agent is **offline**, the policy is stored and applied automatically on its next connection.

---

## Revoking a policy

Click **Revoke** on any policy row (Governance tab or dashboard), or call:

```http
DELETE /api/policies/{id}
```

The control plane immediately triggers a new certificate handshake for any connected agent, embedding the updated (or cleared) policy. In-flight executions that already passed enforcement are not interrupted.

---

## Resource limits in practice

### Token budget (`maxTokensPerDay`)

```json
{ "resourceLimits": { "maxTokensPerDay": 50000 } }
```

The agent counts prompt + completion tokens for every LLM call and stores them in its local SQLite database. Before each intent, it queries today's total:

- If `usedToday < maxTokensPerDay` → proceed
- If `usedToday >= maxTokensPerDay` → reject with `Daily token budget exhausted (used X / limit Y)`

The counter resets at UTC midnight.

### Request rate (`maxRequestsPerHour`)

```json
{ "resourceLimits": { "maxRequestsPerHour": 60 } }
```

The agent keeps a rolling in-memory counter. Each successful intent increments the counter. The window resets automatically after 60 minutes.

- If `count < maxRequestsPerHour` → proceed and increment
- If `count >= maxRequestsPerHour` → reject with `Hourly request limit reached (N req/h) — resets in Xs`

### Policy expiry (`expiresAt`)

```json
{ "expiresAt": "2025-12-31T23:59:59Z" }
```

Once the timestamp passes, the agent rejects every intent before any other check:

```
Policy 'policy-abc123' has expired — action blocked
```

The policy record remains in the database with `includeExpired=true` on the list endpoint. To resume, create a new policy.

---

## Agent-side enforcement order

The agent runs these gates **before** calling the LLM:

```
1. Is the action in the granted capabilities list?        → reject if not
2. Has policyExpiresAt passed?                           → reject if so
3. Has maxTokensPerDay been reached today?               → reject if so
4. Has maxRequestsPerHour been reached this hour?        → reject if so
5. Does the user have a valid delegation certificate?    → reject if not
→ Execute
```

---

## Audit log

The Governance → Audit Log tab merges two data sources:

| Source | Events |
|---|---|
| `activity_log` | Agent connects, disconnects, registers, authenticates; capabilities updated |
| `intent_log` | Intent received, succeeded, or failed (with error message) |

You can filter by source (`activity` / `intent`) and by status (`success` / `failed`).

### Audit entry detail view

Click any row in the audit log to open the full detail page for that entry.

**Left panel — Payload**

For intent entries:
- Timing grid: sent at, completed at, duration in milliseconds
- Collapsible JSON blocks for `params` (intent inputs) and `output` (agent result)
- Error message, if the intent failed

For activity entries:
- Details JSON parsed from the activity payload

**Right panel — Certificate & Cryptographic State**

This panel shows the state of the agent's VaultysId Challenger certificate at the time of the event:

| Field | Description |
|---|---|
| Protocol state | `complete` (green), `failed` (red), or intermediate state (amber) |
| pk1 fingerprint | First 24 chars of the control-plane key in this cert (base64) |
| pk2 fingerprint | First 24 chars of the agent key in this cert (base64) |
| Capabilities in cert | All capabilities currently embedded in the signed certificate |
| Resource limits | `maxTokensPerDay`, `maxRequestsPerHour`, `allowedDomains` if set |
| Policy reference | `policyId` + `policyExpiresAt` — red badge if the policy has expired |
| Raw metadata | Full cert metadata (collapsible), for audit transparency |

The cert information is read live from the agent's stored certificate at query time — it reflects the **current** certificate state, not a historical snapshot.

Entry IDs use a prefix to indicate their source:
- `act-{rowid}` — activity log entry
- `int-{intentId}` — intent log entry

:::tip SIEM integration
For production deployments, pipe the Pino log output from the control plane process to your SIEM (Splunk, Elastic, Datadog). Every audit event is also logged at the process level.
:::

---

## API quick reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/policies` | Global admin | Create a policy |
| `GET` | `/api/policies` | Global admin | List policies (filter by `agentDid`, `realmId`, `includeExpired`) |
| `GET` | `/api/policies/{id}` | Global admin | Get a single policy |
| `DELETE` | `/api/policies/{id}` | Global admin | Revoke a policy |
| `GET` | `/api/governance/summary` | Global admin | Platform-wide posture stats |
| `GET` | `/api/governance/audit` | Global admin | Unified audit log (paginated) |
| `GET` | `/api/governance/audit/{id}` | Global admin | Single audit entry with full payload and cert metadata |

The `{id}` for the audit detail endpoint uses the prefixed format returned by `GET /api/governance/audit` (`act-{rowid}` or `int-{intentId}`).

See [Policies API](/docs/api/policies) for full request/response documentation.
