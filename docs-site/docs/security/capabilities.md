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

## Capability lifecycle

### 1. Agent requests capabilities at registration

When an agent controller starts, it declares which capabilities it wants:

```env
AGENT_CAPABILITIES=file_access,api_call,code_execution
```

This is a **request**, not a grant. The control plane stores the requested capabilities as a pending registration.

### 2. Admin reviews and approves

A global admin reviews the pending registration in the dashboard or via API:

```bash
curl -X POST /api/registrations/{id}/approve \
  -d '{
    "capabilities": ["file_access", "api_call"]
  }'
```

The admin can grant a **subset** of the requested capabilities. The agent is notified immediately.

### 3. Policy is signed and pushed

On approval (and on any subsequent update), the control plane creates a signed policy and pushes it to the agent via the WebSocket channel.

### 4. Runtime enforcement

When an agent receives an intent, it checks whether the action requires a capability, and whether its current policy grants that capability:

```typescript
// Simplified enforcement logic inside the agent
function canExecute(action: string, policy: AgentPolicy): boolean {
  const required = CAPABILITY_MAP[action];
  if (!required) return true; // Action requires no special capability
  return policy.capabilities.includes(required);
}
```

### 5. Revocation

Capabilities can be revoked at any time from the control plane. A new (lower-privilege) policy is signed and pushed to the agent immediately. In-flight executions that already passed the capability check are not interrupted, but the next intent requiring the revoked capability will fail.

## User-level grants

Beyond the agent's policy, non-admin users must also have an explicit **grant** to invoke an agent with a capability:

```
User sends intent for capability X
    → Does user have realm role ≥ operator? (RBAC)
    → Does user have a capability grant for X on this agent? (grant check)
    → Is the grant unexpired?
    → Forward to agent
```

Grants are separate from agent policies. Both must allow the capability for the action to proceed.

## Resource limits

Policies can also include resource limits that cap the agent's consumption:

```json
{
  "resourceLimits": {
    "maxCpuPercent": 50,
    "maxMemoryMb": 512,
    "maxNetworkBandwidthMbps": 10
  }
}
```

Agents are expected to enforce these limits. Monitoring integration for automated enforcement is on the roadmap.

## Time windows

Policies can restrict when an agent is allowed to operate:

```json
{
  "timeWindow": {
    "startTime": "08:00",
    "endTime": "18:00"
  }
}
```

This is useful for agents that should only run during business hours, or that have maintenance windows.
