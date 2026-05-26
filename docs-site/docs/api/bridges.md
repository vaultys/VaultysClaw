---
sidebar_position: 10
title: Bridges
description: REST API reference for channel bridge management and incoming webhook endpoints.
---

# Bridges API

Bridges connect channels to external services (webhooks, Microsoft Teams). See the [External Bridges guide](/docs/channels/bridges) for conceptual background.

:::warning Config is write-only
The `configJson` field (containing OAuth tokens and HMAC secrets) is **never returned** by any API endpoint. Store secrets securely at the time of creation.
:::

---

## Channel bridge management

### List bridges

```http
GET /api/channels/:channelId/bridges
```

**Auth:** Required. Caller must be a channel member.

**Response `200`:**

```json
{
  "bridges": [
    {
      "id": "br_01HZ...",
      "channelId": "ch_01HZ...",
      "externalService": "webhook",
      "externalChannelId": "ci-alerts",
      "externalChannelName": "CI Alerts",
      "externalWorkspaceId": "acme-ci",
      "syncDirection": "incoming",
      "isSyncEnabled": true,
      "createdAt": "2026-05-26T09:00:00Z"
    }
  ]
}
```

---

### Create a bridge

```http
POST /api/channels/:channelId/bridges
```

**Auth:** Required. Caller must be a channel owner or global admin.

#### Webhook bridge

```json
{
  "externalService": "webhook",
  "externalChannelId": "ci-alerts",
  "externalChannelName": "CI Alert Webhook",
  "externalWorkspaceId": "acme-ci",
  "syncDirection": "incoming",
  "config": {
    "webhookUrl": "",
    "outgoingUrl": "https://hooks.acme.com/vaultysclaw",
    "secret": "a-random-secret-at-least-32-chars"
  }
}
```

#### Teams bridge

```json
{
  "externalService": "teams",
  "externalChannelId": "19:abc123@thread.tacv2",
  "externalChannelName": "Engineering (Teams)",
  "externalWorkspaceId": "tenant-id",
  "syncDirection": "bidirectional",
  "config": {
    "accessToken": "eyJ...",
    "tenantId": "tenant-id",
    "botId": "bot-app-id"
  }
}
```

**Common fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `externalService` | `"webhook"` \| `"teams"` | Yes | Bridge type |
| `externalChannelId` | string | Yes | External identifier (webhook: your choice; Teams: channel ID) |
| `externalChannelName` | string | Yes | Human-readable label for the UI |
| `externalWorkspaceId` | string | Yes | Logical grouping (CI platform name, tenant ID, etc.) |
| `syncDirection` | string | No | `"incoming"`, `"outgoing"`, or `"bidirectional"`. Default: `"bidirectional"` |
| `config` | object | Yes | Service-specific configuration (see above) |

**Webhook `config` fields:**

| Field | Required | Description |
|---|---|---|
| `secret` | Yes | HMAC-SHA256 shared secret for incoming request verification |
| `outgoingUrl` | No | URL the control plane POSTs to for outgoing messages |
| `webhookUrl` | No | Unused; leave empty |

**Teams `config` fields:**

| Field | Required | Description |
|---|---|---|
| `accessToken` | Yes | Microsoft Graph API OAuth access token |
| `tenantId` | Yes | Azure AD tenant ID |
| `botId` | Yes | Teams bot application (client) ID |

**Response `201`:**

```json
{
  "bridge": {
    "id": "br_01HZ...",
    "externalService": "webhook",
    "syncDirection": "incoming",
    "isSyncEnabled": true,
    ...
  }
}
```

**Error `400`:** Missing required fields or invalid `externalService`.

**Error `409`:** A bridge for this `(channelId, externalService, externalChannelId)` combination already exists.

---

### Update a bridge

```http
PATCH /api/channels/:channelId/bridges/:bridgeId
```

**Auth:** Required. Caller must be a channel owner or global admin.

All fields are optional. Send only the fields you want to change.

```json
{
  "isSyncEnabled": false,
  "syncDirection": "outgoing"
}
```

| Field | Type | Description |
|---|---|---|
| `isSyncEnabled` | boolean | Enable or disable sync without deleting configuration |
| `syncDirection` | string | Change direction: `"incoming"`, `"outgoing"`, `"bidirectional"` |

**Response `200`:**

```json
{
  "bridge": {
    "isSyncEnabled": false,
    "syncDirection": "outgoing",
    ...
  }
}
```

**Error `404`:** Bridge not found.

---

### Delete a bridge

```http
DELETE /api/channels/:channelId/bridges/:bridgeId
```

**Auth:** Required. Caller must be a channel owner or global admin.

Permanently removes the bridge and its encrypted configuration. Any external service still pointed at the incoming URL will receive `404`.

**Response `200`:**

```json
{ "success": true }
```

---

## Incoming webhook endpoint

This endpoint is **public** (no session required) and is authenticated solely via HMAC-SHA256 signature.

```http
POST /api/bridges/webhook/:bridgeId/incoming
```

**Headers:**

| Header | Required | Description |
|---|---|---|
| `Content-Type` | Yes | `application/json` |
| `X-Signature` | Yes | `sha256=<hex>` — HMAC-SHA256 of the raw request body |

**Request body:**

```json
{
  "message": "Build failed on main",
  "author": "ci-bot",
  "metadata": {
    "buildId": "12345",
    "repo": "acme/backend"
  }
}
```

| Field | Required | Description |
|---|---|---|
| `message` | Yes | Content posted to the channel. Must be non-empty. |
| `author` | No | DID or label. Defaults to `webhook:external`. |
| `metadata` | No | Arbitrary JSON stored in message metadata. |

**Response `200`:**

```json
{
  "ok": true,
  "messageId": "msg_01HZ..."
}
```

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Missing or empty `message` field, or invalid JSON |
| `401` | Invalid or missing `X-Signature` header |
| `403` | Bridge `syncDirection` is `"outgoing"` only, or `isSyncEnabled` is false |
| `404` | `bridgeId` does not exist, or bridge type is not `webhook` |

### Computing the HMAC signature

The signature is computed over the **raw request body bytes** (not re-serialised):

```bash
# Shell (curl + openssl)
BODY='{"message":"Build failed","author":"ci-bot"}'
SECRET="a-random-secret-at-least-32-chars"
SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

curl -X POST \
  "https://vaultysclaw.acme.com/api/bridges/webhook/br_01HZ.../incoming" \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIG" \
  -d "$BODY"
```

```python
import hmac, hashlib, json, requests

secret  = "a-random-secret-at-least-32-chars"
payload = json.dumps({"message": "Build failed", "author": "ci-bot"})
sig     = "sha256=" + hmac.new(
    secret.encode(), payload.encode(), hashlib.sha256
).hexdigest()

requests.post(
    "https://vaultysclaw.acme.com/api/bridges/webhook/br_01HZ.../incoming",
    data=payload,
    headers={"Content-Type": "application/json", "X-Signature": sig},
)
```

```typescript
const crypto = require("crypto");

const secret  = "a-random-secret-at-least-32-chars";
const payload = JSON.stringify({ message: "Build failed", author: "ci-bot" });
const sig     = "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");

await fetch("https://vaultysclaw.acme.com/api/bridges/webhook/br_01HZ.../incoming", {
  method:  "POST",
  headers: { "Content-Type": "application/json", "X-Signature": sig },
  body:    payload,
});
```

---

## Incoming Teams endpoint

```http
POST /api/bridges/teams/incoming
```

This endpoint is called by the Microsoft Teams Bot Framework when a user posts in a Teams channel linked to Vaultys Claw. It looks up the bridge by `channelId` from the Teams event payload and creates a message in the corresponding Vaultys Claw channel.

:::note Bot Framework authentication
JWT verification of the Bot Framework `Authorization` header is marked as a TODO in the current preview implementation. Do not expose this endpoint publicly without adding that verification.
:::

**Headers:**

| Header | Description |
|---|---|
| `Authorization` | Bearer token from Bot Framework (verification TODO) |
| `Content-Type` | `application/json` |

The request body follows the [Bot Framework Activity schema](https://docs.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-api-reference). The endpoint extracts `activity.channelData.teamsChannelId`, looks up the matching bridge, and creates a `ChannelMessage` from the activity text.

**Response `200`:** `{ "ok": true, "messageId": "..." }` on success.
