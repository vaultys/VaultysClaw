---
sidebar_position: 5
title: Workspaces
description: Create and manage organisational scopes.
---

# Workspaces API

Workspaces are organisational scopes that group agents, users, and workflows. See [Workspaces & Roles](/docs/overview/workspaces-and-roles) for an overview.

## List workspaces

```http
GET /api/workspaces
```

**Auth:** Required. Global admins see all workspaces; workspace members see their own workspaces.

### Response

```json
{
  "workspaces": [
    {
      "id": "workspace_01HZ...",
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
      "id": "workspace_default",
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

## Create a workspace

```http
POST /api/workspaces
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
| `name`        | string | Yes      | Human-readable workspace name                                       |
| `slug`        | string | No       | URL-friendly identifier. Auto-generated from `name` if omitted. |
| `description` | string | No       | Optional description                                            |
| `color`       | string | No       | Hex colour for dashboard display (default: `#6b7280`)           |

### Response `201 Created`

```json
{
  "workspace": {
    "id": "workspace_01HZABC...",
    "name": "Research",
    "slug": "research",
    "description": "AI research team agents and workflows",
    "color": "#7c3aed",
    "isDefault": false,
    "createdAt": "2026-05-15T09:00:00Z"
  }
}
```

## Add a member to a workspace

```http
POST /api/workspaces/:id/members
```

**Auth:** Workspace admin or global admin.

```json
{
  "userDid": "did:vaultys:z6MkUser...",
  "role": "operator"
}
```

Valid roles: `owner`, `admin`, `manager`, `operator`, `member`.

## Add an agent to a workspace

```http
POST /api/workspaces/:id/agents
```

**Auth:** Workspace admin or global admin.

```json
{
  "agentDid": "did:vaultys:z6MkAgent..."
}
```

---

## Workspace skills

Skills are workspace-scoped behaviour packages whose Markdown instructions are injected into agent system prompts. For full documentation see [Skills API](/docs/api/skills).

### Get skill detail

```http
GET /api/workspaces/:id/skills/:skillId
```

**Auth:** Any member of the workspace.

Returns the skill's metadata and config (parsed). See [Skills API → Get skill detail](/docs/api/skills#get-skill-detail).

### Update a skill

```http
PATCH /api/workspaces/:id/skills/:skillId
```

**Auth:** Workspace admin or global admin.

Accepted body fields: `description`, `version`, `isRequired`, `config`, `content`. All optional — only provided fields are updated. After a successful PATCH, a `skills_config` broadcast is sent to all connected agents in the workspace.

### Delete a skill

```http
DELETE /api/workspaces/:id/skills/:skillId
```

**Auth:** Workspace admin or global admin.

Removes the skill from the workspace and triggers a `skills_config` broadcast.
