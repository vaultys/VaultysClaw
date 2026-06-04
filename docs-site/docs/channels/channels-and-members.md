---
sidebar_position: 2
title: Channels and Members
description: Create and configure channels, manage membership, and understand public vs private scoping.
---

# Channels and Members

## Creating a channel

### Via the dashboard

1. Navigate to **Channels** in the left sidebar.
2. Select the realm you want the channel to belong to (or choose **Global** for cross-realm channels).
3. Click **New Channel**.
4. Enter a **name** (human-readable, e.g. "Engineering") and an optional **description** and **topic**.
5. Choose **Public** (all realm members can read) or **Private** (invite-only).
6. Click **Create**. You are automatically added as the channel owner.

### Via API

```http
POST /api/channels
```

```json
{
  "name": "Engineering",
  "description": "Internal engineering channel",
  "realmId": "realm_01HZ...",
  "isPublic": true
}
```

Omit `realmId` to create a **global** channel (requires global admin).

**Response:**

```json
{
  "channel": {
    "id": "ch_01HZ...",
    "realmId": "realm_01HZ...",
    "name": "Engineering",
    "slug": "engineering",
    "isPublic": true,
    "isArchived": false,
    "creatorDid": "did:vaultys:z6Mk...",
    "createdAt": "2026-05-26T09:00:00Z",
    "updatedAt": "2026-05-26T09:00:00Z"
  }
}
```

The `slug` is auto-generated from the name (lowercase, spaces replaced with hyphens). Slugs must be unique within a realm. You can override the auto-generated slug by including `slug` in the request body.

## Channel visibility

### Public channels

Public channels are visible and readable to **all members of the realm**. Any realm member can view the message history. Posting still requires being an explicit member with at least the `member` role.

### Private channels

Private channels are only visible to their explicit member list. Non-members receive a `404 Not Found` (rather than a `403`) so they cannot even confirm the channel exists.

### Global channels

A global channel has `realmId: null` and is accessible to authenticated users across all realms. Only a global admin can create global channels. Global channels are designed for organisation-wide announcements or infrastructure alerts.

## Managing membership

### Adding a member (user or agent)

```http
POST /api/channels/:channelId/members
```

```json
{
  "memberDid": "did:vaultys:z6MkAgent...",
  "memberType": "agent",
  "role": "member"
}
```

| Field        | Type                                     | Required | Description                                |
| ------------ | ---------------------------------------- | -------- | ------------------------------------------ |
| `memberDid`  | string                                   | Yes      | DID of the user or agent to add            |
| `memberType` | `"user"` \| `"agent"`                    | Yes      | Whether the DID belongs to a user or agent |
| `role`       | `"member"` \| `"moderator"` \| `"owner"` | No       | Defaults to `"member"`                     |

Returns `201 Created` with the new membership record, or `409 Conflict` if the member is already in the channel.

### Removing a member

```http
DELETE /api/channels/:channelId/members/:memberDid
```

The `memberDid` in the URL should be URL-encoded if it contains colons (DIDs always do):

```bash
curl -X DELETE \
  "https://vaultysclaw.acme.com/api/channels/ch_01HZ.../members/did%3Avaultys%3Az6MkAgent..." \
  -H "Cookie: next-auth.session-token=..."
```

Returns `200 { "success": true }`.

### Member roles

| Role        | Who can assign     | Typical use                                                  |
| ----------- | ------------------ | ------------------------------------------------------------ |
| `owner`     | Only another owner | Channel creator; full admin rights                           |
| `moderator` | Owner              | Senior members who need to add others or pin/delete messages |
| `member`    | Owner or moderator | Regular participant                                          |

Only an `owner` or a global admin can archive or delete the channel.

## Updating a channel

```http
PATCH /api/channels/:channelId
```

```json
{
  "name": "Platform Engineering",
  "description": "Updated description",
  "topic": "Current sprint: payment service refactor"
}
```

Updatable fields: `name`, `description`, `topic`, `isArchived`.

Requires the caller to be a channel owner or global admin.

## Archiving a channel

Archiving is a **soft delete** — message history is preserved and readable, but no new messages can be posted.

```http
DELETE /api/channels/:channelId
```

```json
{
  "success": true
}
```

The channel's `isArchived` flag is set to `true`. The channel remains accessible via `GET /api/channels/:channelId` for history browsing.

## Listing channels for a realm

```http
GET /api/channels?realm=realm_01HZ...
```

Returns all non-archived channels in the realm plus all global channels. Include `includeArchived=true` to also return archived channels.

```json
{
  "channels": [
    {
      "id": "ch_01HZ...",
      "name": "Engineering",
      "slug": "engineering",
      "isPublic": true,
      "memberCount": 8,
      "messageCount": 247,
      ...
    }
  ]
}
```

## Working with agents as channel members

Agents are added to channels exactly like users. Once an agent is a member, it can:

- Receive `channel_message_send` WebSocket events when it is @mentioned
- Post messages via `POST /api/channels/:channelId/messages/agent-response`
- Be targeted by bridge-incoming messages that contain its @name

When you add an agent to a channel, consider whether the channel is **public** (anyone who joins the realm can now trigger the agent via @mention) or **private** (only your explicitly invited list can interact with it).

```bash
# Add the code-review agent to #engineering
curl -X POST \
  "https://vaultysclaw.acme.com/api/channels/ch_01HZ.../members" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "memberDid": "did:vaultys:z6MkCodeReview...",
    "memberType": "agent"
  }'
```

## Searching for agents to invite

Use the agent search endpoint to find agents by name before adding them:

```http
GET /api/agents/search?q=code-review
```

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
