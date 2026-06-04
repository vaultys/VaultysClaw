---
sidebar_position: 9
title: Tool Approvals
description: Manage human-in-the-loop approval requests for sensitive agent actions.
---

# Tool Approvals API

Tool approvals implement **human-in-the-loop** oversight for sensitive agent actions. When an agent encounters a tool flagged for approval, it pauses execution and sends a request to the control plane. An admin reviews and approves or rejects the request before the agent continues.

## List pending approvals

```http
GET /api/tool-approvals
```

**Auth:** Admin only.

### Response

```json
{
  "pending": [
    {
      "id": "tap_01HZ...",
      "agentDid": "did:vaultys:z6Mkf9x3TQ...",
      "agentName": "code-executor",
      "tool": "system_command",
      "context": {
        "command": "rm -rf /tmp/scratch/*",
        "workingDir": "/home/vaultys/workspace",
        "requestedBy": "did:vaultys:z6MkAlice..."
      },
      "requestedAt": "2026-05-15T09:00:00Z",
      "expiresAt": "2026-05-15T09:10:00Z"
    }
  ],
  "history": []
}
```

| Field         | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `id`          | Unique approval request ID                                     |
| `agentDid`    | DID of the agent waiting for approval                          |
| `tool`        | The tool name the agent wants to invoke                        |
| `context`     | Full tool parameters — review these carefully before approving |
| `requestedAt` | When the agent sent the request                                |
| `expiresAt`   | The agent times out if no decision is made by this time        |

## Approve a request

```http
POST /api/tool-approvals/:id/approve
```

**Auth:** Admin only.

No body required.

```json
{ "success": true }
```

The approval is pushed to the agent via WebSocket. The agent resumes execution immediately.

## Reject a request

```http
POST /api/tool-approvals/:id/reject
```

**Auth:** Admin only.

```json
{
  "reason": "This command is too broad. Please scope it to a specific directory."
}
```

Response:

```json
{ "success": true }
```

The rejection (with reason) is pushed to the agent. The agent logs the rejection and returns an error to the caller.

## Configuring which tools require approval

On the agent controller, mark tools as requiring approval in the agent's skill definition:

```typescript
// In a custom skill file
export const dangerousTool = {
  name: "system_command",
  requiresApproval: true, // Triggers the approval flow
  description: "Execute a shell command on the agent's host",
  // ...
};
```

Built-in tools that default to requiring approval:

- `system_command`
- `code_execution` (when executing user-provided code)
- `mail_send` (configurable)

## Approval timeout

The agent waits for approval for up to `APPROVAL_TIMEOUT_MS` (default: 10 minutes). If no decision is received, the tool call is aborted and an error is returned to the caller.

Configure the timeout:

```env
APPROVAL_TIMEOUT_MS=300000   # 5 minutes
```
