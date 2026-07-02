---
sidebar_position: 3
title: Workspaces & Roles
description: Multi-tenant isolation and role-based access control in VaultysClaw.
---

# Workspaces & Roles

VaultysClaw is built for organisations where multiple teams share the same infrastructure but must maintain strict boundaries between their agents, workflows, and data.

## Workspaces

A **workspace** is the primary isolation boundary. It groups agents, users, and workflows into a namespace with its own access control.

```
Organisation
├── Workspace: Engineering   (slug: eng,  color: #3b82f6)
│   ├── Agents: code-executor, test-runner, deploy-bot
│   ├── Users: alice (admin), bob (operator)
│   └── Workflows: ci-pipeline, nightly-review
│
├── Workspace: Research      (slug: research, color: #7c3aed)
│   ├── Agents: claude-researcher, web-scraper
│   ├── Users: carol (admin), dave (member)
│   └── Workflows: literature-scan
│
└── Workspace: Operations    (slug: ops, color: #10b981)
    ├── Agents: mail-dispatch, report-generator
    ├── Users: eve (admin), frank (operator)
    └── Workflows: daily-digest
```

### Creating a workspace

```bash
curl -X POST https://vaultysclaw.acme.internal/api/workspaces \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "name": "Engineering",
    "slug": "eng",
    "description": "Software engineering team agents",
    "color": "#3b82f6"
  }'
```

### Workspace visibility rules

| User type       | Visible workspaces         |
| --------------- | ---------------------- |
| Global admin    | All workspaces             |
| Workspace admin     | Workspaces they administer |
| Workspace member    | Workspaces they belong to  |
| Unauthenticated | None                   |

## Roles

Every user has a **role** within each workspace they belong to. Roles are hierarchical — a higher role includes all permissions of lower roles.

### Role capabilities

| Action                 | member | operator | manager | admin | owner | global admin |
| ---------------------- | :----: | :------: | :-----: | :---: | :---: | :----------: |
| View agents in workspace   |   ✓    |    ✓     |    ✓    |   ✓   |   ✓   |      ✓       |
| Send intents           |   —    |    ✓     |    ✓    |   ✓   |   ✓   |      ✓       |
| Approve tool requests  |   —    |    —     |    ✓    |   ✓   |   ✓   |      ✓       |
| Create/edit workflows  |   —    |    —     |    —    |   ✓   |   ✓   |      ✓       |
| Manage workspace users     |   —    |    —     |    —    |   ✓   |   ✓   |      ✓       |
| Manage workspace agents    |   —    |    —     |    —    |   ✓   |   ✓   |      ✓       |
| Create/manage policies |   —    |    —     |    —    |   —   |   —   |      ✓       |
| Delete workspace           |   —    |    —     |    —    |   —   |   ✓   |      ✓       |
| Manage global settings |   —    |    —     |    —    |   —   |   —   |      ✓       |

### Assigning roles

Roles are managed through the dashboard or API. Only workspace admins (or global admins) can assign roles within their workspace.

```bash
# Add a user to a workspace with a specific role
curl -X POST https://vaultysclaw.acme.internal/api/workspaces/eng/members \
  -H "Content-Type: application/json" \
  -d '{
    "userDid": "did:vaultys:z6Mkf...",
    "role": "operator"
  }'
```

## Capability grants

Beyond workspace roles, **capability grants** provide fine-grained control over which users can invoke which agents with which capabilities.

A user with the `operator` role in a workspace can send intents — but only if they have an explicit grant for the target capability.

```bash
# Grant user the ability to use 'api_call' on a specific agent
curl -X POST https://vaultysclaw.acme.internal/api/grants \
  -H "Content-Type: application/json" \
  -d '{
    "userDid": "did:vaultys:z6Mkb...",
    "agentDid": "did:vaultys:z6Mkf...",
    "capabilities": ["api_call", "file_access"],
    "expiresAt": "2026-12-31T23:59:59Z"
  }'
```

:::tip
Global admins bypass capability grant checks. For all other roles, both a workspace role and a capability grant are required to send intents.
:::

## Default workspace

Every VaultysClaw installation has a **default workspace** created on first boot. Agents that register without specifying a workspace are placed in the default workspace. You can rename and re-colour it, but it cannot be deleted.

## Agent membership

Agents can belong to **one or more workspaces**. An agent's primary workspace determines which users can manage it by default. Membership in additional workspaces extends visibility to users in those workspaces.

```bash
# Assign an agent to an additional workspace
curl -X POST https://vaultysclaw.acme.internal/api/workspaces/research/agents \
  -d '{ "agentDid": "did:vaultys:z6Mkf..." }'
```
