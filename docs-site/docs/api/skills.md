---
sidebar_position: 9
title: Skills
description: API endpoints for managing realm skills and token usage statistics.
---

# Skills API

Skills are reusable agent-behaviour packages attached to realms. Their Markdown `content` is injected into agent system prompts at runtime.

See the [Skills guide](/docs/guides/skills) for a conceptual overview.

---

## List all skills

```http
GET /api/skills
```

**Auth:** Global admin only.

Returns every skill across all realms, with realm metadata and counters.

### Response `200 OK`

```json
[
  {
    "id": "sk_01HZ...",
    "realm_id": "realm_01HZ...",
    "realm_name": "Engineering",
    "name": "code-review",
    "description": "Guidelines for reviewing pull requests",
    "version": "1.2.0",
    "is_required": 0,
    "config": "{\"language\":\"typescript\"}",
    "content": "# Code Review\nAlways check for type safety...",
    "created_at": "2026-05-01T09:00:00Z",
    "agent_count": 3,
    "override_count": 0
  }
]
```

| Field            | Description                                             |
| ---------------- | ------------------------------------------------------- |
| `agent_count`    | Number of agents currently enrolled in this realm       |
| `override_count` | Number of per-agent overrides configured for this skill |

---

## Create a skill

```http
POST /api/skills
```

**Auth:** Global admin only.

### Request body

```json
{
  "realmId": "realm_01HZ...",
  "name": "customer-support",
  "description": "Friendly support agent persona",
  "version": "1.0.0",
  "isRequired": true,
  "config": { "tone": "formal" },
  "content": "# Customer Support\nYou are a helpful support agent..."
}
```

| Field         | Type    | Required | Description                                                                            |
| ------------- | ------- | -------- | -------------------------------------------------------------------------------------- |
| `realmId`     | string  | Yes      | ID of the realm to attach the skill to                                                 |
| `name`        | string  | Yes      | Unique within the realm — used to deduplicate when an agent belongs to multiple realms |
| `description` | string  | No       | Human-readable summary                                                                 |
| `version`     | string  | No       | Semver string (informational only)                                                     |
| `isRequired`  | boolean | No       | Default `false`. If `true`, agents cannot opt out                                      |
| `config`      | object  | No       | Arbitrary JSON metadata                                                                |
| `content`     | string  | No       | Markdown instructions injected into the agent system prompt                            |

### Response `201 Created`

Returns the raw DB row:

```json
{
  "id": "sk_01HZ...",
  "realm_id": "realm_01HZ...",
  "name": "customer-support",
  "description": "Friendly support agent persona",
  "version": "1.0.0",
  "is_required": 1,
  "config": "{\"tone\":\"formal\"}",
  "content": "# Customer Support\nYou are a helpful support agent...",
  "created_at": "2026-05-20T10:30:00Z"
}
```

### Error responses

| Status | Condition                                           |
| ------ | --------------------------------------------------- |
| `400`  | `realmId` missing, `name` missing or blank          |
| `404`  | Realm not found                                     |
| `409`  | A skill with this name already exists in this realm |

---

## Get skill detail

```http
GET /api/realms/:id/skills/:skillId
```

**Auth:** Any member of realm `:id`.

### Response `200 OK`

```json
{
  "skill": {
    "id": "sk_01HZ...",
    "realmId": "realm_01HZ...",
    "name": "customer-support",
    "description": "Friendly support agent persona",
    "version": "1.0.0",
    "isRequired": true,
    "config": { "tone": "formal" },
    "createdAt": "2026-05-20T10:30:00Z"
  }
}
```

Note: `config` is returned as a parsed object. The `content` field is not included in this response — use `PATCH` to read/write it, or check it via `GET /api/skills` (global admin).

### Error responses

| Status | Condition                                        |
| ------ | ------------------------------------------------ |
| `403`  | Caller is not a member of this realm             |
| `404`  | Skill not found, or belongs to a different realm |

---

## Update a skill

```http
PATCH /api/realms/:id/skills/:skillId
```

**Auth:** Realm admin or global admin.

All body fields are optional — only the fields you include are updated.

### Request body

```json
{
  "description": "Updated persona guidelines",
  "version": "1.1.0",
  "isRequired": false,
  "config": { "tone": "casual" },
  "content": "# Customer Support v1.1\nUpdated instructions..."
}
```

| Field         | Type           | Description                                         |
| ------------- | -------------- | --------------------------------------------------- |
| `description` | string \| null | Pass `null` to clear                                |
| `version`     | string \| null | Pass `null` to clear                                |
| `isRequired`  | boolean        | Flip the required flag                              |
| `config`      | object         | Replace the entire config object                    |
| `content`     | string \| null | Replace instructions; pass `null` to remove content |

### Response `200 OK`

Returns the updated skill in camelCase format (same shape as GET).

After a successful PATCH, the control plane broadcasts a `skills_config` update to all connected agents in this realm — they receive the new content immediately.

---

## Delete a skill

```http
DELETE /api/realms/:id/skills/:skillId
```

**Auth:** Realm admin or global admin.

Removes the skill from the realm. Connected agents receive a `skills_config` broadcast and stop injecting this skill's content into their prompts.

### Response `200 OK`

```json
{ "ok": true }
```

### Error responses

| Status | Condition                   |
| ------ | --------------------------- |
| `403`  | Caller is not a realm admin |
| `404`  | Skill not found             |

---

## Browse the skills library

```http
GET /api/skills/library
```

**Auth:** Global admin only.

Proxies the skills-library.com catalogue. The response is cached for 1 hour to avoid rate-limiting.

### Response `200 OK`

Returns the raw JSON from skills-library.com — an array of skill entries:

```json
[
  {
    "id": "frontend-design",
    "name": "Frontend Design",
    "description": "UI/UX guidelines for frontend agents",
    "source": "anthropics/skills",
    "skillId": "frontend-design",
    "installs": 1420,
    "githubStars": 340,
    "repoUrl": "https://github.com/anthropics/skills",
    "standalone": true,
    "contentType": "markdown"
  }
]
```

---

## Fetch skill content from GitHub

```http
GET /api/skills/library/content?source=anthropics/skills&skillId=frontend-design
```

**Auth:** Global admin only.

Fetches the `SKILL.md` file for a library skill from its GitHub repository, strips the YAML frontmatter, and returns the cleaned Markdown.

### Query parameters

| Parameter | Required | Description                                        |
| --------- | -------- | -------------------------------------------------- |
| `source`  | Yes      | GitHub `owner/repo` path, e.g. `anthropics/skills` |
| `skillId` | Yes      | Skill identifier, e.g. `frontend-design`           |

The endpoint tries the following paths in order (on both `main` and `master` branches):

1. `skills/{skillId}/SKILL.md`
2. `{skillId}/SKILL.md`
3. `{skillId}.md`

### Response `200 OK`

```json
{
  "content": "# Frontend Design\nUse semantic HTML...",
  "url": "https://github.com/anthropics/skills/raw/refs/heads/main/skills/frontend-design/SKILL.md"
}
```

### Error responses

| Status | Condition                                     |
| ------ | --------------------------------------------- |
| `400`  | `source` or `skillId` query parameter missing |
| `404`  | SKILL.md not found at any of the tried paths  |

---

## Fleet-wide token statistics

```http
GET /api/stats/tokens
```

**Auth:** Global admin only.

Returns aggregated token usage across **all agents** (online and offline) sourced directly from the database. The dashboard uses this endpoint to power the _Today_, _This month_, and _All time_ token metric cards, refreshing every 60 seconds.

### Response `200 OK`

```json
{
  "allTime": {
    "promptTokens": 4820000,
    "completionTokens": 1230000
  },
  "daily": {
    "promptTokens": 14200,
    "completionTokens": 3800
  },
  "monthly": {
    "promptTokens": 310000,
    "completionTokens": 85000
  }
}
```

| Field     | Source table                | Description                                          |
| --------- | --------------------------- | ---------------------------------------------------- |
| `allTime` | `agent_token_usage`         | Cumulative totals per agent, summed across the fleet |
| `daily`   | `agent_token_usage_history` | Today's bucket (`YYYY-MM-DD`, granularity `day`)     |
| `monthly` | `agent_token_usage_history` | This month's bucket (`YYYY-MM`, granularity `month`) |

Token data is written by agent heartbeats. Each heartbeat includes a `sinceLastSync` delta which is added to the history buckets. `allTime` is the running cumulative total.

:::note Offline agents
Because the source is the database (not the in-memory WebSocket state), this endpoint correctly reflects usage from agents that are currently offline or that have disconnected since their last heartbeat.
:::
