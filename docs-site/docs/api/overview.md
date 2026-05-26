---
sidebar_position: 1
title: API Overview
description: How to authenticate and use the Vaultys Claw REST API.
---

# API Overview

The Vaultys Claw REST API is served by the control plane on port 3000 (default). All endpoints are under the `/api` path.

## Base URL

```
https://vaultysclaw.acme.com/api
```

## Authentication

All API endpoints require an authenticated session. Vaultys Claw uses **session cookie authentication** via NextAuth.js.

### Obtain a session

```bash
# Sign in with email + password (if configured)
curl -X POST https://vaultysclaw.acme.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{ "email": "alice@acme.com", "password": "..." }'

# The response sets a session cookie:
# Set-Cookie: next-auth.session-token=...
```

### Using the session cookie

Include the session cookie in all subsequent requests:

```bash
curl https://vaultysclaw.acme.com/api/agents \
  -H "Cookie: next-auth.session-token=eyJ..."
```

In JavaScript/TypeScript (browser):

```typescript
const res = await fetch("/api/agents", {
  credentials: "include",   // Send session cookie automatically
});
```

From a server-side application, use the `Authorization` header with a Bearer token (service account tokens — feature on roadmap).

## Response format

All API responses are JSON. Successful responses return HTTP 2xx:

```json
{
  "agents": [...],
  "total": 12,
  "page": 1,
  "pageSize": 20
}
```

### Error responses

```json
{
  "error": "Forbidden",
  "message": "You do not have permission to perform this action"
}
```

Common HTTP status codes:

| Code | Meaning |
|---|---|
| `200 OK` | Success |
| `201 Created` | Resource created |
| `202 Accepted` | Request accepted (async operation, e.g. intent routing) |
| `400 Bad Request` | Invalid request body or parameters |
| `401 Unauthorized` | No valid session |
| `403 Forbidden` | Authenticated but insufficient permissions |
| `404 Not Found` | Resource does not exist |
| `500 Internal Server Error` | Unexpected server error |

## Pagination

List endpoints support pagination via query parameters:

| Parameter | Default | Description |
|---|---|---|
| `page` | `1` | Page number (1-indexed) |
| `pageSize` | `20` | Items per page (max 100) |
| `sortBy` | varies | Field to sort by |
| `sortDir` | `asc` | `asc` or `desc` |

Paginated responses include metadata:

```json
{
  "items": [...],
  "total": 87,
  "page": 2,
  "pageSize": 20,
  "totalPages": 5
}
```

## Rate limiting

The API does not enforce rate limits in the default configuration. For production deployments, configure rate limiting at the reverse proxy level (nginx `limit_req`, Caddy `rate_limit`).

## API endpoints at a glance

| Resource | Endpoints |
|---|---|
| [Agents](/docs/api/agents) | `GET /agents`, `GET /agents/:id`, `POST /agents/register` |
| [Intents](/docs/api/intents) | `POST /intents`, `GET /intents` |
| [Policies](/docs/api/policies) | `POST /policies`, `GET /policies`, `GET /policies/:id`, `DELETE /policies/:id` |
| [Governance](/docs/guides/governance#api-quick-reference) | `GET /governance/summary`, `GET /governance/audit`, `GET /governance/audit/:id` |
| [Realms](/docs/api/realms) | `GET /realms`, `POST /realms` |
| [Users](/docs/api/users) | `GET /users`, `GET /users/me` |
| [Chat](/docs/api/chat) | `POST /chat` (streaming SSE) |
| [Workflows](/docs/api/workflows) | `GET /workflows`, `POST /workflows`, `POST /workflows/:id/run` |
| [Tool Approvals](/docs/api/tool-approvals) | `GET /tool-approvals`, `POST /tool-approvals/:id/approve`, `POST /tool-approvals/:id/reject` |
| [Registrations](/docs/api/agents#registration-approval) | `GET /registrations`, `POST /registrations/:id/approve`, `POST /registrations/:id/reject` |
| [Models](/docs/api/models) | `GET /models`, `POST /models`, `GET /models/:id`, `PUT /models/:id`, `DELETE /models/:id` |
| [Model Realm Access](/docs/api/models#grant-realm-access) | `POST /models/:id/realms`, `DELETE /models/:id/realms/:realmId` |
| [Agent LLM Config](/docs/api/models#agent-llm-config-endpoints) | `GET /agents/:did/llm-config`, `PUT /agents/:did/llm-config`, `DELETE /agents/:did/llm-config` |
| [Skills](/docs/api/skills) | `GET /skills`, `POST /skills`, `GET /realms/:id/skills/:skillId`, `PATCH /realms/:id/skills/:skillId`, `DELETE /realms/:id/skills/:skillId` |
| [Skills Library](/docs/api/skills#browse-the-skills-library) | `GET /skills/library`, `GET /skills/library/content` |
| [Token Stats](/docs/api/skills#fleet-wide-token-statistics) | `GET /stats/tokens` |
| [Channels](/docs/api/channels) | `GET /channels`, `POST /channels`, `GET /channels/:id`, `PATCH /channels/:id`, `DELETE /channels/:id` |
| [Channel Members](/docs/api/channels#members) | `POST /channels/:id/members`, `DELETE /channels/:id/members/:memberDid` |
| [Channel Messages](/docs/api/channels#messages) | `GET /channels/:id/messages`, `POST /channels/:id/messages`, `POST /channels/:id/messages/agent-response` |
| [Channel Bridges](/docs/api/bridges) | `GET /channels/:id/bridges`, `POST /channels/:id/bridges`, `PATCH /channels/:id/bridges/:bridgeId`, `DELETE /channels/:id/bridges/:bridgeId` |
| [Webhook Incoming](/docs/api/bridges#incoming-webhook-endpoint) | `POST /bridges/webhook/:bridgeId/incoming` (public, HMAC-verified) |
| [Teams Incoming](/docs/api/bridges#incoming-teams-endpoint) | `POST /bridges/teams/incoming` (Bot Framework) |
| [Agent Search](/docs/api/channels#agent-search) | `GET /agents/search?q=...` |
| [Me — Realms](/docs/api/channels#me--realms) | `GET /me/realms` |
