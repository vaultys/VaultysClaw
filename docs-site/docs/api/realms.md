---
sidebar_position: 5
title: Realms
description: Create and manage organisational scopes.
---

# Realms API

Realms are organisational scopes that group agents, users, and workflows. See [Realms & Roles](/docs/overview/realms-and-roles) for an overview.

## List realms

```http
GET /api/realms
```

**Auth:** Required. Global admins see all realms; realm members see their own realms.

### Response

```json
{
  "realms": [
    {
      "id": "realm_01HZ...",
      "name": "Engineering",
      "slug": "eng",
      "description": "Software engineering team agents",
      "color": "#3b82f6",
      "isDefault": false,
      "createdAt": "2026-01-15T10:00:00Z",
      "agentCount": 4,
      "userCount": 8,
      "workflowCount": 3
    },
    {
      "id": "realm_default",
      "name": "Default",
      "slug": "default",
      "description": null,
      "color": "#6b7280",
      "isDefault": true,
      "createdAt": "2026-01-01T00:00:00Z",
      "agentCount": 1,
      "userCount": 1,
      "workflowCount": 0
    }
  ]
}
```

## Create a realm

```http
POST /api/realms
```

**Auth:** Global admin only.

### Request body

```json
{
  "name": "Research",
  "slug": "research",
  "description": "AI research team agents and workflows",
  "color": "#7c3aed"
}
```

| Field         | Type   | Required | Description                                                     |
| ------------- | ------ | -------- | --------------------------------------------------------------- |
| `name`        | string | Yes      | Human-readable realm name                                       |
| `slug`        | string | No       | URL-friendly identifier. Auto-generated from `name` if omitted. |
| `description` | string | No       | Optional description                                            |
| `color`       | string | No       | Hex colour for dashboard display (default: `#6b7280`)           |

### Response `201 Created`

```json
{
  "realm": {
    "id": "realm_01HZABC...",
    "name": "Research",
    "slug": "research",
    "description": "AI research team agents and workflows",
    "color": "#7c3aed",
    "isDefault": false,
    "createdAt": "2026-05-15T09:00:00Z"
  }
}
```

## Add a member to a realm

```http
POST /api/realms/:id/members
```

**Auth:** Realm admin or global admin.

```json
{
  "userDid": "did:vaultys:z6MkUser...",
  "role": "operator"
}
```

Valid roles: `owner`, `admin`, `manager`, `operator`, `member`.

## Add an agent to a realm

```http
POST /api/realms/:id/agents
```

**Auth:** Realm admin or global admin.

```json
{
  "agentDid": "did:vaultys:z6MkAgent..."
}
```

---

## Realm skills

Skills are realm-scoped behaviour packages whose Markdown instructions are injected into agent system prompts. For full documentation see [Skills API](/docs/api/skills).

### Get skill detail

```http
GET /api/realms/:id/skills/:skillId
```

**Auth:** Any member of the realm.

Returns the skill's metadata and config (parsed). See [Skills API → Get skill detail](/docs/api/skills#get-skill-detail).

### Update a skill

```http
PATCH /api/realms/:id/skills/:skillId
```

**Auth:** Realm admin or global admin.

Accepted body fields: `description`, `version`, `isRequired`, `config`, `content`. All optional — only provided fields are updated. After a successful PATCH, a `skills_config` broadcast is sent to all connected agents in the realm.

### Delete a skill

```http
DELETE /api/realms/:id/skills/:skillId
```

**Auth:** Realm admin or global admin.

Removes the skill from the realm and triggers a `skills_config` broadcast.
