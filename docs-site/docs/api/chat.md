---
sidebar_position: 7
title: Chat
description: Stream LLM conversations through agent controllers.
---

# Chat API

The Chat API allows you to have real-time streaming conversations with an agent's configured LLM. All messages are proxied through the agent controller, which enforces policies and logs sessions.

## Send a chat message

```http
POST /api/chat
```

**Auth:** Required. The user must have a capability grant (or be an admin) to interact with the target agent.

Returns a `text/event-stream` (Server-Sent Events) response.

### Request body

```json
{
  "agentDid": "did:vaultys:z6Mkf9x3TQ...",
  "messages": [
    {
      "role": "user",
      "content": "Summarise the key trends in Q1 2026 for the EMEA region."
    }
  ],
  "sessionId": "sess_01HZ..."
}
```

| Field       | Type   | Required | Description                                           |
| ----------- | ------ | -------- | ----------------------------------------------------- |
| `agentDid`  | string | Yes      | The agent to chat with                                |
| `messages`  | array  | Yes      | Conversation history (OpenAI-compatible format)       |
| `sessionId` | string | No       | Resume an existing session. Omit to create a new one. |

### Message format

```typescript
interface ChatMessageEntry {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  name?: string; // For tool messages
  tool_calls?: any[]; // For assistant messages with tool use
}
```

### Response: Server-Sent Events stream

The response is a streaming `text/event-stream`. Each event contains a chunk of the LLM's response:

```
data: {"chunk": "The key trends"}

data: {"chunk": " in Q1 2026 for"}

data: {"chunk": " the EMEA region are:"}

data: {"chunk": "\n\n1. **Rising adoption"}

data: [DONE]
```

The stream ends with the literal `data: [DONE]` event.

### Consuming the stream (JavaScript)

```typescript
const response = await fetch("/api/chat", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    agentDid: "did:vaultys:z6Mkf9x3TQ...",
    messages: [{ role: "user", content: "Hello!" }],
  }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let full = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      const payload = line.slice(6);
      if (payload === "[DONE]") break;
      const { chunk } = JSON.parse(payload);
      full += chunk;
      // Update your UI with `chunk`
    }
  }
}
```

### Consuming the stream (Python)

```python
import requests, json

res = requests.post(
    "https://vaultysclaw.acme.com/api/chat",
    json={
        "agentDid": "did:vaultys:z6Mkf9x3TQ...",
        "messages": [{"role": "user", "content": "Hello!"}],
    },
    cookies={"next-auth.session-token": "..."},
    stream=True,
)

for line in res.iter_lines():
    if line.startswith(b"data: "):
        payload = line[6:]
        if payload == b"[DONE]":
            break
        chunk = json.loads(payload)["chunk"]
        print(chunk, end="", flush=True)
```

## Chat sessions

Chat history is stored per session. Sessions are created automatically when you omit `sessionId`.

### List sessions for an agent

```http
GET /api/chat/sessions?agentDid=did:vaultys:z6Mkf9...
```

```json
{
  "sessions": [
    {
      "id": "sess_01HZ...",
      "title": "Q1 EMEA analysis",
      "createdAt": "2026-05-15T09:00:00Z",
      "updatedAt": "2026-05-15T09:12:00Z",
      "messageCount": 6
    }
  ]
}
```

### Get session messages

```http
GET /api/chat/sessions/:sessionId/messages
```

```json
{
  "messages": [
    { "role": "user", "content": "Summarise Q1 trends...", "createdAt": "..." },
    { "role": "assistant", "content": "The key trends...", "createdAt": "..." }
  ]
}
```
