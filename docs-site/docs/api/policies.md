---
sidebar_position: 4
title: Policies
description: Create and manage agent capability policies.
---

# Policies API

A **policy** is a cryptographically-signed document that defines what an agent is allowed to do. Policies are created by global admins and pushed to agents automatically via the WebSocket channel.

## Create a policy

```http
POST /api/policies
```

**Auth:** Global admin only.

### Request body

```json
{
  "agentId": "did:vaultys:z6Mkf9x3TQ...",
  "capabilities": ["api_call", "file_access"],
  "resourceLimits": {
    "maxCpuPercent": 50,
    "maxMemoryMb": 512,
    "maxNetworkBandwidthMbps": 10
  },
  "timeWindow": {
    "startTime": "08:00",
    "endTime": "18:00"
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `agentId` | string | No | Target agent DID. Omit with `broadcast: true` to apply to all agents. |
| `capabilities` | string[] | Yes | Capabilities to grant |
| `resourceLimits` | object | No | CPU, memory, and bandwidth caps |
| `timeWindow` | object | No | Operating hours restriction |
| `broadcast` | boolean | No | If `true`, push to all connected agents |

### Response `201 Created`

```json
{
  "id": "pol_01HZABC...",
  "agentId": "did:vaultys:z6Mkf9x3TQ...",
  "capabilities": ["api_call", "file_access"],
  "sentTo": ["did:vaultys:z6Mkf9x3TQ..."],
  "signature": "base64..."
}
```

The policy is immediately signed with the control plane's VaultysId and pushed to the target agent(s) via WebSocket.

## List policies

```http
GET /api/policies
```

**Auth:** Global admin only.

:::info Coming soon
Policy history storage is currently in development.
:::

## Policy enforcement on agents

When an agent receives a policy via WebSocket, it:

1. Verifies the policy signature against the control plane's public key
2. Checks that the policy version is higher than the current one (prevents downgrade)
3. Stores the policy and uses it for all subsequent intent verification

The enforcement logic at execution time:

```
Intent received
    ↓
Is signature valid?                    → reject if not
    ↓
Is intent from trusted control plane?  → reject if not
    ↓
Does action require a capability?      → allow if no capability needed
    ↓
Does current policy grant it?          → reject if not
    ↓
Is current time within time window?    → reject if outside window
    ↓
Execute
```

## Resource limits

Resource limits are advisory by default. Agents are expected to enforce them, but the control plane does not independently monitor compliance. Integration with process monitoring tools (cgroups, Docker resource limits) for hard enforcement is on the roadmap.

| Limit field | Unit | Description |
|---|---|---|
| `maxCpuPercent` | 0–100 | Maximum CPU usage |
| `maxMemoryMb` | Megabytes | Maximum resident memory |
| `maxNetworkBandwidthMbps` | Megabits/sec | Maximum outbound bandwidth |
