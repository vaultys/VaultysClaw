---
sidebar_position: 6
title: Users
description: Manage users and view your own profile.
---

# Users API

## Get current user

```http
GET /api/users/me
```

**Auth:** Required.

Returns the authenticated user's profile, realm memberships, and capability grants.

### Response

```json
{
  "user": {
    "id": "did:vaultys:z6MkAlice...",
    "name": "Alice Smith",
    "email": "alice@acme.com",
    "isAdmin": true,
    "registeredAt": "2026-01-10T09:00:00Z"
  },
  "realms": [
    {
      "id": "realm_eng",
      "name": "Engineering",
      "slug": "eng",
      "color": "#3b82f6",
      "role": "admin"
    }
  ],
  "grants": [
    {
      "id": "grant_01HZ...",
      "agentDid": null,
      "agentName": null,
      "capabilities": ["api_call", "file_access"],
      "expiresAt": null,
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

## List users

```http
GET /api/users
```

**Auth:** Admin only.

### Query parameters

| Parameter | Type | Description |
|---|---|---|
| `q` | string | Search by name or email |
| `role` | string | Filter by role (`owner`, `admin`, etc.) |
| `realm` | string | Filter by realm ID or slug |
| `isAdmin` | boolean | Filter to global admins |
| `page` | integer | Page number |
| `pageSize` | integer | Items per page |
| `sortBy` | string | `name`, `email`, `registeredAt` |
| `sortDir` | string | `asc` or `desc` |

### Response

```json
{
  "users": [
    {
      "id": "did:vaultys:z6MkAlice...",
      "name": "Alice Smith",
      "email": "alice@acme.com",
      "isAdmin": true,
      "registeredAt": "2026-01-10T09:00:00Z",
      "realms": [
        { "id": "realm_eng", "name": "Engineering", "role": "admin" }
      ]
    }
  ],
  "total": 24,
  "page": 1,
  "pageSize": 20,
  "totalPages": 2
}
```

## Capability grants

Grants allow non-admin users to send intents with specific capabilities.

### Create a grant

```http
POST /api/grants
```

**Auth:** Global admin or realm admin.

```json
{
  "userDid": "did:vaultys:z6MkBob...",
  "agentDid": "did:vaultys:z6MkAgent...",
  "capabilities": ["api_call"],
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

Set `agentDid` to `null` to grant access to all agents.

### Revoke a grant

```http
DELETE /api/grants/:id
```

**Auth:** Global admin or realm admin.

The associated delegation certificate is immediately invalidated — the next time the agent checks it, the verification will fail.
