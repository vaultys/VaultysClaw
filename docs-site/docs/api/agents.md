---
sidebar_position: 2
title: Agents
description: Manage agent controllers through the REST API.
---

# Agents API

## List agents

```http
GET /api/agents
```

Returns a paginated list of registered agent controllers.

**Auth:** Required. Global admins see all agents; workspace members see agents in their workspaces.

### Query parameters

| Parameter      | Type    | Description                                                            |
| -------------- | ------- | ---------------------------------------------------------------------- |
| `q`            | string  | Search by agent name or DID                                            |
| `online`       | boolean | Filter to online/offline agents                                        |
| `workspace`        | string  | Filter by workspace ID or slug                                             |
| `capabilities` | string  | Comma-separated capabilities — returns agents that have **all** listed |
| `page`         | integer | Page number (default: 1)                                               |
| `pageSize`     | integer | Items per page (default: 20)                                           |
| `sortBy`       | string  | `name`, `registeredAt`, `lastSeen`                                     |
| `sortDir`      | string  | `asc` or `desc`                                                        |

### Response

```json
{
  "agents": [
    {
      "id": "did:vaultys:z6Mkf9x3TQ...",
      "name": "analyst-gpt4",
      "capabilities": ["api_call", "file_access"],
      "llmProvider": "openai",
      "llmModel": "gpt-4o",
      "isOnline": true,
      "registeredAt": "2026-04-01T10:00:00Z",
      "lastSeen": "2026-05-15T08:59:00Z",
      "workspace": {
        "id": "workspace_eng",
        "name": "Engineering",
        "slug": "eng",
        "color": "#3b82f6"
      }
    }
  ],
  "total": 12,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1,
  "online": 9
}
```

---

## Get agent

```http
GET /api/agents/:id
```

**Auth:** Required.

Returns full details for a single agent including its current policy.

### Response

```json
{
  "id": "did:vaultys:z6Mkf9x3TQ...",
  "name": "analyst-gpt4",
  "capabilities": ["api_call", "file_access"],
  "llmProvider": "openai",
  "llmModel": "gpt-4o",
  "llmSystemPrompt": "You are a financial analyst...",
  "isOnline": true,
  "registeredAt": "2026-04-01T10:00:00Z",
  "lastSeen": "2026-05-15T08:59:00Z",
  "publicKey": "z6Mkf9x3TQ...",
  "workspace": {
    "id": "workspace_eng",
    "name": "Engineering",
    "slug": "eng",
    "color": "#3b82f6"
  }
}
```

---

## Register agent

```http
POST /api/agents/register
```

Registers a new agent controller. In most cases agents register automatically via the WebSocket channel when they first connect. This HTTP endpoint is provided for programmatic registration.

**Auth:** Optional.

### Request body

```json
{
  "name": "my-new-agent",
  "version": "1.0.0",
  "capabilities": ["api_call", "file_access"],
  "publicKey": "z6Mkf9..."
}
```

### Response `201 Created`

```json
{
  "agentId": "did:vaultys:z6Mkf9...",
  "message": "Agent registered. Awaiting admin approval."
}
```

---

## Registration approval {#registration-approval}

New agent registrations require admin approval before the agent becomes active.

### List pending registrations

```http
GET /api/registrations
```

**Auth:** Global admin only.

```json
{
  "registrations": [
    {
      "id": "reg_01HZ...",
      "name": "my-new-agent",
      "publicKey": "z6Mkf9...",
      "requestedCapabilities": ["api_call", "file_access"],
      "requestedAt": "2026-05-15T09:00:00Z"
    }
  ],
  "availableCapabilities": [
    "file_access",
    "internet_access",
    "browser_control",
    "api_call",
    "mail_send",
    "code_execution",
    "system_command",
    "agent_communication"
  ]
}
```

### Approve a registration

```http
POST /api/registrations/:id/approve
```

**Auth:** Global admin only.

```json
{
  "capabilities": ["api_call", "file_access"]
}
```

You can grant a **subset** of the requested capabilities.

Response `200 OK`:

```json
{
  "success": true,
  "agentId": "did:vaultys:z6Mkf9..."
}
```

### Reject a registration

```http
POST /api/registrations/:id/reject
```

**Auth:** Global admin only.

```json
{
  "reason": "This agent requires additional security review."
}
```

Response `200 OK`:

```json
{ "success": true }
```
