---
sidebar_position: 3
title: Messaging and Threads
description: Post messages, @mention agents, create threads, and understand how agent responses work.
---

# Messaging and Threads

## Posting a message

### Via the dashboard

Open the channel and type in the composer at the bottom. Press **Enter** (or click **Send**) to post. The channel renders messages in real time; the list polls every few seconds and also auto-scrolls only when you are already at the bottom.

### Via API

```http
POST /api/channels/:channelId/messages
```

**Auth:** Required. The caller must be a member of the channel.

```json
{
  "content": "The deploy pipeline finished successfully.",
  "threadId": null,
  "metadata": {
    "mentions": ["ops-bot"],
    "agentAction": null
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | string | Yes | Message body (Markdown supported) |
| `threadId` | string | No | ID of the parent message to reply to. Omit for top-level messages. |
| `metadata` | object | No | Optional enrichment (mentions, attachments, tool calls) |

**Response:**

```json
{
  "message": {
    "id": "msg_01HZ...",
    "channelId": "ch_01HZ...",
    "threadId": null,
    "authorDid": "did:vaultys:z6MkAlice...",
    "authorType": "user",
    "content": "The deploy pipeline finished successfully.",
    "metadata": {},
    "reactions": {},
    "editedAt": null,
    "deletedAt": null,
    "createdAt": "2026-05-26T10:00:00Z"
  }
}
```

After the message is stored the server fires a **background** call to `MessageDispatcher.processMessage` (fire-and-forget). This means the HTTP response is immediate regardless of whether any agent is mentioned.

## @mentioning an agent

When a message contains `@agent-name`, the `MessageDispatcher` automatically:

1. **Detects the mention** — scans the content for `@[\w\-]+` tokens.
2. **Looks up the agent** — queries the `agents` table for a matching `name`.
3. **Creates a thread reply** on the parent message as an acknowledgement.
4. **Invokes the agent** by sending a `channel_message_send` WebSocket event.

### Mention format

```
@agent-name please check the latest build
```

- Agent names that contain colons or spaces must be enclosed in backticks — prefer slug-style names (lowercase, hyphens only) for @mentions to work reliably.
- Multiple agents can be mentioned in a single message; each receives its own invocation.

### What the agent receives

```typescript
// WSChannelMessageSendPayload (sent over WebSocket to agent)
{
  type: "channel_message_send",
  payload: {
    channelId: "ch_01HZ...",
    messageId: "msg_01HZ...",     // The message containing the @mention
    content: "@code-review please check PR #42",
    authorDid: "did:vaultys:z6MkAlice...",
    threadId: "msg_01HZ...",      // Same as messageId — agent replies into this thread
    createdAt: "2026-05-26T10:00:00Z"
  }
}
```

### Offline agents

If the agent's WebSocket connection is not active at the time of the mention, the dispatcher posts an offline notice into the thread immediately:

```
code-review is currently offline and could not receive this message.
```

The message is not re-sent when the agent reconnects — if your workflow requires guaranteed delivery, check the channel history after reconnect or post the message again.

### Agent response

Agents post their responses via:

```http
POST /api/channels/:channelId/messages/agent-response
```

```json
{
  "content": "Review complete. Found 2 issues:\n\n1. ...\n2. ...",
  "threadId": "msg_01HZ..."
}
```

This endpoint authenticates via the agent's session (the same VaultysId the agent registered with). The `authorType` is set to `"agent"` automatically.

The response always lands inside the **thread** of the original @mention, keeping the main channel timeline clean.

## Threading

Any message can be the parent of a thread. Threads are a flat list of replies — there is no nested threading.

### Creating a thread reply

```http
POST /api/channels/:channelId/messages
```

```json
{
  "content": "Following up: the CI cache was stale, fixed now.",
  "threadId": "msg_01HZ..."
}
```

Setting `threadId` attaches the message to the thread whose root is `msg_01HZ...`.

### Reading a thread

```http
GET /api/channels/:channelId/messages?threadId=msg_01HZ...
```

Returns all replies to the given parent message, in chronological order:

```json
{
  "messages": [
    {
      "id": "msg_02HZ...",
      "threadId": "msg_01HZ...",
      "authorDid": "did:vaultys:z6MkCodeReview...",
      "authorType": "agent",
      "content": "Review complete. Found 2 issues...",
      ...
    },
    ...
  ]
}
```

## Listing messages in a channel

```http
GET /api/channels/:channelId/messages?limit=50&offset=0
```

Returns the most recent top-level messages (no `threadId`). Pagination is controlled by `limit` (max 100) and `offset`.

```json
{
  "messages": [
    {
      "id": "msg_01HZ...",
      "threadId": null,
      "authorDid": "did:vaultys:z6MkAlice...",
      "content": "@code-review please check PR #42",
      ...
    }
  ]
}
```

## Message content and Markdown

Message content is stored as plain text and rendered as **Markdown** in the dashboard. All standard Markdown is supported including:

- `**bold**`, `*italic*`, `` `inline code` ``
- Fenced code blocks with syntax highlighting
- Bullet and numbered lists
- Links `[text](url)`

Agents should use Markdown in their responses to ensure rich rendering in the dashboard.

## Reactions

Reactions are stored as a JSON map from emoji to list of DIDs. They are part of the message record and updated via the reactions endpoint:

```http
POST /api/channels/:channelId/messages/:messageId/reactions
```

```json
{
  "emoji": "👍",
  "add": true
}
```

Setting `"add": false` removes the calling user's reaction. The response returns the updated message with the new `reactions` map.

## Message dispatcher internals

The `MessageDispatcher` is a server-side class responsible for routing @mentions to agents and fanning out to bridges. It is called fire-and-forget from the message POST handler:

```typescript
// Simplified from lib/message-dispatcher.ts
class MessageDispatcher {
  static extractMentions(content: string): string[] {
    return [...content.matchAll(/@([\w\-]+)/g)].map(m => m[1]);
  }

  static async processMessage(
    channelId: string,
    messageId: string,
    authorDid: string,
    content: string,
    messageContext?: { id: string; authorType: string; threadId: string | null; createdAt: string }
  ): Promise<void> {
    const mentions = this.extractMentions(content);
    // For each mention, look up agent, create ack thread reply, dispatch WS event
    // Then fan out to active outgoing bridges
  }
}
```

Key behaviours:

- Agent-authored messages do **not** trigger mention detection (prevents loops).
- Each mention is processed independently; if one agent lookup fails the others proceed.
- Bridge fan-out runs in parallel via `Promise.allSettled`; one bridge failure never blocks others.
