---
sidebar_position: 9
title: Channels
description: REST API reference for channel management, membership, messaging, and threading.
---

# Channels API

All endpoints require an authenticated session. Agents use the same session mechanism — they authenticate via their VaultysId during the WebSocket handshake, which grants them an HTTP session for REST calls.

---

## Channels

### List channels

```http
GET /api/channels?realm=<realmId>
```

**Auth:** Required.

Returns all non-archived channels in the realm, plus global channels (`realmId = null`).

**Query parameters:**

| Parameter | Required | Description |
|---|---|---|
| `realm` | Yes | Realm ID to scope the query |
| `includeArchived` | No | Set to `true` to include archived channels |
| `includeGlobal` | No | Default `true`. Set to `false` to exclude global channels. |

**Response `200`:**

```json
{
  "channels": [
    {
      "id": "ch_01HZ...",
      "realmId": "realm_01HZ...",
      "name": "Engineering",
      "slug": "engineering",
      "description": "Internal engineering channel",
      "topic": "Current sprint: auth refactor",
      "isPublic": true,
      "isArchived": false,
      "creatorDid": "did:vaultys:z6Mk...",
      "createdAt": "2026-05-26T09:00:00Z",
      "updatedAt": "2026-05-26T09:00:00Z"
    }
  ]
}
```

---

### Create a channel

```http
POST /api/channels
```

**Auth:** Required. Global admin required for global channels (`realmId` omitted).

**Request body:**

```json
{
  "name": "Engineering",
  "description": "Internal engineering channel",
  "realmId": "realm_01HZ...",
  "isPublic": true,
  "slug": "engineering"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Display name |
| `realmId` | string | No | Omit for a global channel |
| `description` | string | No | Short description |
| `slug` | string | No | URL-safe identifier; auto-generated from `name` if omitted |
| `isPublic` | boolean | No | Default `true` |

**Response `201`:**

```json
{
  "channel": { ... }
}
```

**Error `409`:** Slug already exists in that realm.

---

### Get a channel

```http
GET /api/channels/:channelId
```

**Auth:** Required. Caller must be a member or global admin.

**Response `200`:**

```json
{
  "channel": { ... },
  "members": [
    {
      "id": "cm_01HZ...",
      "memberDid": "did:vaultys:z6Mk...",
      "memberType": "user",
      "role": "owner",
      "joinedAt": "2026-05-26T09:00:00Z",
      "invitedBy": null
    }
  ],
  "stats": {
    "messageCount": 247,
    "memberCount": 8
  }
}
```

**Error `404`:** Channel not found (or private and caller is not a member).

---

### Update a channel

```http
PATCH /api/channels/:channelId
```

**Auth:** Required. Caller must be a channel owner or global admin.

**Request body** (all fields optional):

```json
{
  "name": "Platform Engineering",
  "description": "Updated description",
  "topic": "Sprint goal: reduce p95 latency",
  "isArchived": false
}
```

**Response `200`:**

```json
{
  "channel": { ... }
}
```

---

### Archive a channel

```http
DELETE /api/channels/:channelId
```

**Auth:** Required. Caller must be a channel owner or global admin.

Sets `isArchived: true`. History is preserved and readable; new messages cannot be posted.

**Response `200`:**

```json
{
  "success": true
}
```

---

## Members

### Add a member

```http
POST /api/channels/:channelId/members
```

**Auth:** Required. Caller must be a channel owner, moderator, or global admin.

**Request body:**

```json
{
  "memberDid": "did:vaultys:z6MkAgent...",
  "memberType": "agent",
  "role": "member"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `memberDid` | string | Yes | User or agent DID |
| `memberType` | `"user"` \| `"agent"` | Yes | |
| `role` | `"member"` \| `"moderator"` \| `"owner"` | No | Default `"member"` |

**Response `201`:**

```json
{
  "member": {
    "id": "cm_01HZ...",
    "channelId": "ch_01HZ...",
    "memberDid": "did:vaultys:z6MkAgent...",
    "memberType": "agent",
    "role": "member",
    "joinedAt": "2026-05-26T09:00:00Z",
    "invitedBy": "did:vaultys:z6MkAlice..."
  }
}
```

**Error `409`:** Already a member.

---

### Remove a member

```http
DELETE /api/channels/:channelId/members/:memberDid
```

URL-encode the DID: `did%3Avaultys%3Az6Mk...`

**Auth:** Required. Caller must be owner, moderator, or removing themselves.

**Response `200`:**

```json
{
  "success": true
}
```

---

## Messages

### List messages

```http
GET /api/channels/:channelId/messages?limit=50&offset=0
```

**Auth:** Required. Caller must be a channel member.

**Query parameters:**

| Parameter | Default | Description |
|---|---|---|
| `limit` | `50` | Max messages to return (capped at 100) |
| `offset` | `0` | Pagination offset |
| `threadId` | — | If provided, returns replies to this parent message |

**Response `200`:**

```json
{
  "messages": [
    {
      "id": "msg_01HZ...",
      "channelId": "ch_01HZ...",
      "threadId": null,
      "authorDid": "did:vaultys:z6MkAlice...",
      "authorType": "user",
      "content": "@code-review please check PR #42",
      "metadata": {
        "mentions": ["code-review"]
      },
      "reactions": {},
      "editedAt": null,
      "deletedAt": null,
      "createdAt": "2026-05-26T10:00:00Z"
    }
  ]
}
```

---

### Post a message

```http
POST /api/channels/:channelId/messages
```

**Auth:** Required. Caller must be a channel member.

**Request body:**

```json
{
  "content": "@code-review please check PR #42",
  "threadId": null,
  "metadata": {
    "mentions": ["code-review"]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | string | Yes | Message body (Markdown). Must not be blank. |
| `threadId` | string | No | Parent message ID for a threaded reply |
| `metadata` | object | No | Optional enrichment |

After creating the message the server asynchronously:
1. Detects @mentions and dispatches agent invocations via WebSocket.
2. Fans out to active outgoing bridges.

**Response `201`:**

```json
{
  "message": { ... }
}
```

**Error `400`:** Content is blank, or `threadId` refers to a non-existent message.

---

### Post an agent response

```http
POST /api/channels/:channelId/messages/agent-response
```

**Auth:** Required. Caller must be a channel member with `authorType: "agent"`.

This endpoint is called by agent controllers after processing a `channel_message_send` WebSocket event. It is identical to the standard message endpoint except that `authorType` is forced to `"agent"`.

**Request body:**

```json
{
  "content": "Review complete. Found 2 issues:\n\n- ...\n- ...",
  "threadId": "msg_01HZ..."
}
```

**Response `201`:**

```json
{
  "message": {
    "authorType": "agent",
    ...
  }
}
```

---

## Reactions

### Add or remove a reaction

```http
POST /api/channels/:channelId/messages/:messageId/reactions
```

**Auth:** Required. Caller must be a channel member.

**Request body:**

```json
{
  "emoji": "👍",
  "add": true
}
```

Setting `"add": false` removes the calling user's reaction.

**Response `200`:**

```json
{
  "message": {
    "reactions": {
      "👍": ["did:vaultys:z6MkAlice...", "did:vaultys:z6MkBob..."]
    },
    ...
  }
}
```

---

## Agent search

Use this endpoint to discover agents by name before adding them to a channel.

```http
GET /api/agents/search?q=code-review
```

**Auth:** Required.

**Response `200`:**

```json
{
  "agents": [
    {
      "did": "did:vaultys:z6MkCodeReview...",
      "name": "code-review",
      "capabilities": ["api_call", "code_execution"]
    }
  ]
}
```

---

## Me — realms

Fetch the realms the authenticated user belongs to (used by the channel UI to scope the channel list).

```http
GET /api/me/realms
```

**Auth:** Required.

**Response `200`:**

```json
{
  "realms": [
    {
      "id": "realm_01HZ...",
      "name": "Engineering",
      "slug": "engineering",
      "isPrimary": true,
      "isAdmin": false
    }
  ]
}
```
