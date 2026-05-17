---
sidebar_position: 3
title: Intents
description: Send work to agents via the Intents API.
---

# Intents API

An **intent** is a signed, structured request to execute a named action on one or more agents. The control plane signs the intent with its VaultysId before routing it — agents verify this signature before executing.

## Send an intent

```http
POST /api/intents
```

**Auth:** Required. Non-admin users must have a capability grant for the action.

Returns `202 Accepted` immediately. The intent is routed to the target agent(s) asynchronously.

### Request body

```json
{
  "agentId": "did:vaultys:z6Mkf9x3TQ...",
  "action": "summarise_document",
  "params": {
    "url": "https://internal.acme.com/reports/q1-2026.pdf",
    "format": "bullet_points",
    "maxWords": 300
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `agentId` | string | No | Target agent DID. Omit to broadcast. |
| `action` | string | Yes | The action name to execute |
| `params` | object | Yes | Action-specific parameters |
| `broadcastCapability` | string | No | When broadcasting (no `agentId`), only send to agents that have this capability |

### Broadcast to all capable agents

Omit `agentId` to broadcast to all connected agents:

```json
{
  "action": "health_check",
  "params": {}
}
```

Or broadcast only to agents with a specific capability:

```json
{
  "broadcastCapability": "internet_access",
  "action": "fetch_news",
  "params": { "topic": "AI regulation" }
}
```

### Response `202 Accepted`

```json
{
  "intentId": "int_01HZABC...",
  "action": "summarise_document",
  "sentTo": ["did:vaultys:z6Mkf9x3TQ..."],
  "count": 1
}
```

| Field | Description |
|---|---|
| `intentId` | Unique ID for this intent (used for replay prevention) |
| `sentTo` | Array of agent DIDs that received the intent |
| `count` | Number of agents the intent was sent to |

### Error: no capable agents online

```json
{
  "error": "No agents available",
  "message": "No connected agents match the requested capability"
}
```

### Error: insufficient permissions

```json
{
  "error": "Forbidden",
  "message": "You do not have a capability grant for 'code_execution' on this agent"
}
```

## List intents

```http
GET /api/intents
```

**Auth:** Required.

:::info Coming soon
Full intent history with results is currently in development. This endpoint returns a placeholder response.
:::

```json
{
  "intents": [],
  "message": "Intent history coming soon"
}
```

## Action naming conventions

Actions are arbitrary strings — Vaultys Claw does not enforce a naming scheme. By convention, use `snake_case` verbs:

| Example action | Description |
|---|---|
| `echo` | Built-in test action; returns params as output |
| `chat_completion` | Ask the agent's LLM a question |
| `summarise_document` | Summarise a document at a URL |
| `send_email` | Send an email (requires `mail_send` capability) |
| `run_code` | Execute a code snippet (requires `code_execution`) |
| `fetch_url` | Fetch and return HTTP response (requires `internet_access`) |
| `search_web` | Web search (requires `internet_access`) |
| `read_file` | Read a local file (requires `file_access`) |
| `write_file` | Write a local file (requires `file_access`) |

Custom agents can define any action name. The `CAPABILITY_MAP` in the agent controller maps action names to the required capability.
