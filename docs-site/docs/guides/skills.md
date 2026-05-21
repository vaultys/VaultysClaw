---
sidebar_position: 6
title: Skills
description: How to package reusable agent behaviours as skills and inject them into the agent system prompt.
---

# Skills

A **skill** is a named unit of reusable agent behaviour attached to a realm. Each skill carries optional Markdown instructions that are automatically injected into the system prompt of every agent enrolled in that realm — no code changes required.

---

## How skills work

```
Realm skill (DB)
  ├── name            — unique identifier within the realm
  ├── description     — shown in the control-plane dashboard
  ├── version         — optional semver string
  ├── isRequired      — if true, the skill is always active; agents cannot opt out
  ├── config          — arbitrary JSON passed alongside the skill (available in future tool integrations)
  └── content         — Markdown instructions injected into the agent system prompt
```

When an agent connects, the control plane pushes a `skills_config` WebSocket message containing all active skills for each of the agent's realms. If a skill's `content` field is non-empty, the agent appends it to its base system prompt:

```
[Base system prompt]

---

[Skill 1 content]

---

[Skill 2 content]
```

This means you can give an agent specialised domain knowledge, personas, or behavioural rules **at runtime**, managed entirely from the control plane.

---

## Managing skills from the dashboard

Navigate to **Skills** (sidebar → *Skills*) — this page is available to global admins.

### Statistics bar

The top of the page shows four counters:

| Counter | Description |
|---|---|
| Total entries | Number of skill-realm pairs across all realms |
| Unique skills | Number of distinct skill names |
| Realms with skills | Realms that have at least one skill configured |
| Shared across realms | Skills that appear in more than one realm |

### Skill cards

Skills are grouped by name. Each card shows:

- All realms the skill is deployed to, with agent counts
- Whether that realm's instance carries Markdown instructions ("instructions" badge) or not ("no instructions" hint)
- Per-realm **Edit** and **Delete** buttons
- An **Add to realm** button to share the same skill definition to an additional realm

### Searching

Type in the search box to filter by skill name or description. Results update with a 200 ms debounce.

---

## Creating a skill

Click **New skill** in the top-right corner of the Skills page. Fill in:

| Field | Required | Notes |
|---|---|---|
| Realm | Yes | The realm this skill instance belongs to |
| Name | Yes | Must be unique within the realm |
| Description | No | Human-readable summary |
| Version | No | Semver string — informational only |
| Required | No | Checked → always active; unchecked → agents can disable via override |
| Config (JSON) | No | Arbitrary metadata forwarded alongside the skill |
| Instructions (Markdown) | No | Content injected into the agent system prompt |

---

## Sharing a skill to another realm

Every skill group card has an **Add to realm** button. This opens a pre-filled form containing the source skill's name, description, version, and instructions — you only need to choose:

- The **target realm** (realms where the skill already exists are excluded)
- Whether the skill is **required** in that realm
- An optional **config** override specific to that realm

The skill is **shared by reference to a name**, not cloned. Each realm stores its own row, so descriptions and configs can diverge independently.

---

## Editing a skill

Click **Edit** on any realm row within a skill card to:

- Update description, version, required flag, or config
- Update or clear the Markdown instructions
- Re-fetch instructions from the skills library (if the skill was imported from there)

Changes take effect immediately — the control plane broadcasts an updated `skills_config` to all connected agents in that realm.

---

## Skills library

The skills library is a curated public directory of pre-built skills hosted at [skills-library.com](https://skills-library.com).

Click **Browse library** to open a searchable modal that fetches all available skills. For each entry you can see:

- Name, description, and source repository
- Install count and GitHub stars
- Whether the skill comes with standalone Markdown content

Clicking **Add** on a library skill automatically:

1. Fetches the `SKILL.md` file from the skill's GitHub repository
2. Strips the YAML frontmatter
3. Pre-fills the New skill form with the skill's name, description, and the fetched Markdown content

You can edit anything before saving.

### How content is fetched

The control plane tries the following paths in order (both `main` and `master` branches):

```
https://github.com/{source}/raw/refs/heads/{branch}/skills/{skillId}/SKILL.md
https://github.com/{source}/raw/refs/heads/{branch}/{skillId}/SKILL.md
https://github.com/{source}/raw/refs/heads/{branch}/{skillId}.md
```

The first successful fetch wins. YAML frontmatter (` --- ... --- `) is stripped before the content is stored.

---

## Skill content format

Skill instructions are plain **Markdown**. They can include:

- Role/persona definitions
- Behavioural guidelines and constraints
- Domain knowledge snippets
- Example interactions in fenced code blocks

```markdown
# Customer Support Agent

You are a friendly, empathetic customer support specialist for Acme Corp.

## Guidelines

- Always greet the user by name if provided.
- Escalate billing issues to the finance team — never attempt to resolve them yourself.
- If unsure, say "I don't know" rather than guessing.

## Products

- **AcmePro** — enterprise SaaS. Docs at docs.acme.com/pro
- **AcmeLite** — self-serve tier. Docs at docs.acme.com/lite
```

---

## `isRequired` vs agent overrides

| `isRequired` | Effect |
|---|---|
| `true` | The skill is always active. The agent ignores any per-agent override. |
| `false` | The skill defaults to enabled. A realm admin or agent operator can disable it for a specific agent via the agent detail page. |

:::info
Required skills are always injected into the system prompt, even if an agent has an override record that sets `enabled = false` for that skill. Use `isRequired` for compliance or safety-critical instructions.
:::

---

## Token metrics dashboard

The **Dashboard** (home page) shows three token metric cards — *Today*, *This month*, and *All time* — covering the **entire fleet**, including agents that are currently offline.

These metrics are sourced directly from the `agent_token_usage` and `agent_token_usage_history` tables, which are updated via heartbeat messages from every agent. The data is refreshed every 60 seconds.

:::note Historical data
Before this feature was introduced, the dashboard only reflected the subset of agents that were connected at load time. Historical token data has been preserved since the first heartbeat of each agent.
:::

---

## API quick reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/skills` | Global admin | List all skills across all realms |
| `POST` | `/api/skills` | Global admin | Create a skill in a realm |
| `GET` | `/api/realms/:id/skills/:skillId` | Realm member | Get skill detail |
| `PATCH` | `/api/realms/:id/skills/:skillId` | Realm admin | Update skill |
| `DELETE` | `/api/realms/:id/skills/:skillId` | Realm admin | Delete skill from realm |
| `GET` | `/api/skills/library` | Global admin | Proxy to skills-library.com (1 h cache) |
| `GET` | `/api/skills/library/content` | Global admin | Fetch SKILL.md from a GitHub source |
| `GET` | `/api/stats/tokens` | Global admin | Fleet-wide token stats (all-time, daily, monthly) |

See [Skills API](/docs/api/skills) for full request/response documentation.
