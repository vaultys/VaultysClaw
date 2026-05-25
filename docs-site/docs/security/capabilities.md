---
sidebar_position: 3
title: Capabilities
description: Fine-grained permission control for agent actions.
---

# Capabilities

Capabilities are the core mechanism by which Vaultys Claw enforces the **principle of least privilege**. An agent can only perform actions for which it has been explicitly granted a capability.

## Available capabilities

| Capability | What it allows | Typical use cases |
|---|---|---|
| `file_access` | Read and write files within the agent's workspace root | Document processing, report generation, local data pipelines |
| `internet_access` | Make outbound HTTP/HTTPS requests | Web scraping, API consumption, data enrichment |
| `browser_control` | Control a headless browser (Playwright / Puppeteer) | Web automation, screenshot capture, form submission |
| `api_call` | Call external APIs (structured, not arbitrary HTTP) | CRM integrations, ticket systems, SaaS connectors |
| `mail_send` | Send email | Notifications, digests, alerts |
| `code_execution` | Execute arbitrary code in a sandbox | Code generation and testing, data analysis scripts |
| `system_command` | Execute shell commands | DevOps automation, system monitoring |
| `agent_communication` | Send intents to peer agents | Multi-agent orchestration, delegation of subtasks |
| `knowledge_search` | Query the agent's local vector knowledge base via the `knowledge_search` tool | RAG over indexed documents, PDF/web knowledge bases, enterprise Q&A |

---

## Capability lifecycle

### 1. Agent requests capabilities at registration

When an agent controller starts, it declares which capabilities it wants:

```env
AGENT_CAPABILITIES=file_access,api_call,code_execution
```

This is a **request**, not a grant. The control plane stores it as a pending registration.

### 2. Admin reviews and approves

A global admin reviews the pending registration in the dashboard or via API:

```bash
curl -X POST /api/registrations/{id}/approve \
  -d '{"capabilities": ["file_access", "api_call"]}'
```

The admin can grant a **subset** of the requested capabilities.

### 3. Capabilities and resource limits are embedded in the certificate

On approval (and on any subsequent policy change), the control plane triggers a fresh [VaultysId Challenger](/docs/security/vaultys-id) handshake. The capabilities **and** any governance metadata (`resourceLimits`, `policyId`, `policyExpiresAt`) are embedded as native values inside the Challenger certificate's metadata. Both parties co-sign the certificate, so the values cannot be forged or replayed.

```
Control plane calls challenger.update(agentCert, {
  capabilities: ["file_access", "api_call"],
  resourceLimits: { maxTokensPerDay: 50000 },
  policyId: "policy-abc123",
  policyExpiresAt: "2025-12-31T23:59:59Z"
})
```

The agent reads these values from `ctx.metadata.pk2` after the handshake completes.

### 4. Runtime enforcement

When an agent receives an intent it runs four checks in order:

| Check | What fails it |
|---|---|
| Capability check | Action not in the granted capabilities list |
| Policy expiry | `policyExpiresAt` timestamp has passed |
| Daily token budget | `maxTokensPerDay` tokens already consumed today |
| Hourly request rate | `maxRequestsPerHour` intents already executed this hour |

The enforcement code lives in `agent.ts → handleIntent()` and runs **before** `executeAction()`.

### 5. Revocation

Capabilities can be revoked at any time by deleting the policy from the **Governance** tab or via `DELETE /api/policies/{id}`. The control plane immediately triggers a new certificate handshake for any connected agent, which embeds the updated (or cleared) capability set. In-flight executions that already passed the capability check are not interrupted.

---

## Managing capabilities

Capabilities are **no longer edited directly** on the agent overview page. All capability grants go through the **Governance tab** on the agent detail page (or the global Governance dashboard), which creates a policy record. This ensures:

- Every capability change has an audit trail
- Resource limits and expiry are set alongside the capability grant
- The full change is co-signed by both parties in the certificate

To grant capabilities to an agent:

1. Open the agent detail page → **Governance** tab
2. Click **New Policy**
3. Select capabilities, set optional resource limits and expiry
4. Click **Apply Policy** — the certificate is reissued immediately for connected agents

:::tip Knowledge Search shortcut
The **Knowledge** tab on the agent detail page detects when indexed documents exist but `knowledge_search` is not granted, and surfaces a one-click **Grant capability** button that creates the policy automatically. See [Knowledge Bases](/docs/guides/knowledge-bases) for details.
:::

---

## User-level grants

Beyond the agent's policy, non-admin users must also have an explicit **grant** to invoke an agent with a capability:

```
User sends intent for capability X
    → Does user have realm role ≥ operator? (RBAC)
    → Does user have a capability grant for X on this agent? (grant check)
    → Is the grant unexpired?
    → Forward to agent
```

Grants are separate from policies. Both must allow the capability for the action to proceed.

---

## Resource limits reference

Policies can include resource limits that the agent enforces at intent execution time:

```json
{
  "resourceLimits": {
    "maxTokensPerDay": 50000,
    "maxRequestsPerHour": 60,
    "allowedDomains": ["api.openai.com", "example.com"]
  }
}
```

| Field | Enforcement |
|---|---|
| `maxTokensPerDay` | Hard block — agent rejects intents when today's token total ≥ limit |
| `maxRequestsPerHour` | Hard block — agent rejects intents when current-hour count ≥ limit |
| `allowedDomains` | Advisory — agents may enforce for outbound HTTP tools |

Token usage is tracked locally by the agent's SQLite database and resets at UTC midnight.

---

## Policy expiry

Set `expiresAt` on a policy to automatically block an agent after a specific date:

```json
{ "expiresAt": "2025-12-31T23:59:59Z" }
```

Once the timestamp passes, the agent rejects every intent with `Policy '...' has expired — action blocked`. The policy record remains in the database and is visible with `includeExpired=true` on the list endpoint. To resume operations, create a new policy.
