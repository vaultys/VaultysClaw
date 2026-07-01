---
sidebar_position: 6
title: Skills
description: How to package reusable agent behaviours as skills and inject them into the agent system prompt.
---

# Skills

A **skill** is a named unit of reusable agent behaviour attached to a workspace. Each skill carries optional Markdown instructions that are automatically injected into the system prompt of every agent enrolled in that workspace — no code changes required.

---

## How skills work

```
Workspace skill (DB)
  ├── name            — unique identifier within the workspace
  ├── description     — shown in the control-plane dashboard
  ├── version         — optional semver string
  ├── isRequired      — if true, the skill is always active; agents cannot opt out
  ├── config          — arbitrary JSON passed alongside the skill (available in future tool integrations)
  └── content         — Markdown instructions injected into the agent system prompt
```

When an agent connects, the control plane pushes a `skills_config` WebSocket message containing all active skills for each of the agent's workspaces. If a skill's `content` field is non-empty, the agent appends it to its base system prompt:

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

Navigate to **Skills** (sidebar → _Skills_) — this page is available to global admins.

### Statistics bar

The top of the page shows four counters:

| Counter              | Description                                    |
| -------------------- | ---------------------------------------------- |
| Total entries        | Number of skill-workspace pairs across all workspaces  |
| Unique skills        | Number of distinct skill names                 |
| Workspaces with skills   | Workspaces that have at least one skill configured |
| Shared across workspaces | Skills that appear in more than one workspace      |

### Skill cards

Skills are grouped by name. Each card shows:

- All workspaces the skill is deployed to, with agent counts
- Whether that workspace's instance carries Markdown instructions ("instructions" badge) or not ("no instructions" hint)
- Per-workspace **Edit** and **Delete** buttons
- An **Add to workspace** button to share the same skill definition to an additional workspace

### Searching

Type in the search box to filter by skill name or description. Results update with a 200 ms debounce.

---

## Creating a skill

Click **New skill** in the top-right corner of the Skills page. Fill in:

| Field                   | Required | Notes                                                                |
| ----------------------- | -------- | -------------------------------------------------------------------- |
| Workspace                   | Yes      | The workspace this skill instance belongs to                             |
| Name                    | Yes      | Must be unique within the workspace                                      |
| Description             | No       | Human-readable summary                                               |
| Version                 | No       | Semver string — informational only                                   |
| Required                | No       | Checked → always active; unchecked → agents can disable via override |
| Config (JSON)           | No       | Arbitrary metadata forwarded alongside the skill                     |
| Instructions (Markdown) | No       | Content injected into the agent system prompt                        |

---

## Sharing a skill to another workspace

Every skill group card has an **Add to workspace** button. This opens a pre-filled form containing the source skill's name, description, version, and instructions — you only need to choose:

- The **target workspace** (workspaces where the skill already exists are excluded)
- Whether the skill is **required** in that workspace
- An optional **config** override specific to that workspace

The skill is **shared by reference to a name**, not cloned. Each workspace stores its own row, so descriptions and configs can diverge independently.

---

## Editing a skill

Click **Edit** on any workspace row within a skill card to:

- Update description, version, required flag, or config
- Update or clear the Markdown instructions
- Re-fetch instructions from the skills library (if the skill was imported from there)

Changes take effect immediately — the control plane broadcasts an updated `skills_config` to all connected agents in that workspace.

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

The first successful fetch wins. YAML frontmatter (`--- ... ---`) is stripped before the content is stored.

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

| `isRequired` | Effect                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `true`       | The skill is always active. The agent ignores any per-agent override.                                                         |
| `false`      | The skill defaults to enabled. A workspace admin or agent operator can disable it for a specific agent via the agent detail page. |

:::info
Required skills are always injected into the system prompt, even if an agent has an override record that sets `enabled = false` for that skill. Use `isRequired` for compliance or safety-critical instructions.
:::

---

## Token metrics dashboard

The **Dashboard** (home page) shows three token metric cards — _Today_, _This month_, and _All time_ — covering the **entire fleet**, including agents that are currently offline.

These metrics are sourced directly from the `agent_token_usage` and `agent_token_usage_history` tables, which are updated via heartbeat messages from every agent. The data is refreshed every 60 seconds.

:::note Historical data
Before this feature was introduced, the dashboard only reflected the subset of agents that were connected at load time. Historical token data has been preserved since the first heartbeat of each agent.
:::

---

## API quick reference

| Method   | Path                              | Auth         | Description                                       |
| -------- | --------------------------------- | ------------ | ------------------------------------------------- |
| `GET`    | `/api/skills`                     | Global admin | List all skills across all workspaces                 |
| `POST`   | `/api/skills`                     | Global admin | Create a skill in a workspace                         |
| `GET`    | `/api/workspaces/:id/skills/:skillId` | Workspace member | Get skill detail                                  |
| `PATCH`  | `/api/workspaces/:id/skills/:skillId` | Workspace admin  | Update skill                                      |
| `DELETE` | `/api/workspaces/:id/skills/:skillId` | Workspace admin  | Delete skill from workspace                           |
| `GET`    | `/api/skills/library`             | Global admin | Proxy to skills-library.com (1 h cache)           |
| `GET`    | `/api/skills/library/content`     | Global admin | Fetch SKILL.md from a GitHub source               |
| `GET`    | `/api/stats/tokens`               | Global admin | Fleet-wide token stats (all-time, daily, monthly) |

See [Skills API](/docs/api/skills) for full request/response documentation.
