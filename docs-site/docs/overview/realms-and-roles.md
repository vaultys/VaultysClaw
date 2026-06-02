---
sidebar_position: 3
title: Realms & Roles
description: Multi-tenant isolation and role-based access control in Vaultys Claw.
---

# Realms & Roles

Vaultys Claw is built for organisations where multiple teams share the same infrastructure but must maintain strict boundaries between their agents, workflows, and data.

## Realms

A **realm** is the primary isolation boundary. It groups agents, users, and workflows into a namespace with its own access control.

```
Organisation
├── Realm: Engineering   (slug: eng,  color: #3b82f6)
│   ├── Agents: code-executor, test-runner, deploy-bot
│   ├── Users: alice (admin), bob (operator)
│   └── Workflows: ci-pipeline, nightly-review
│
├── Realm: Research      (slug: research, color: #7c3aed)
│   ├── Agents: claude-researcher, web-scraper
│   ├── Users: carol (admin), dave (member)
│   └── Workflows: literature-scan
│
└── Realm: Operations    (slug: ops, color: #10b981)
    ├── Agents: mail-dispatch, report-generator
    ├── Users: eve (admin), frank (operator)
    └── Workflows: daily-digest
```

### Creating a realm

```bash
curl -X POST https://vaultysclaw.acme.internal/api/realms \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "name": "Engineering",
    "slug": "eng",
    "description": "Software engineering team agents",
    "color": "#3b82f6"
  }'
```

### Realm visibility rules

| User type       | Visible realms         |
| --------------- | ---------------------- |
| Global admin    | All realms             |
| Realm admin     | Realms they administer |
| Realm member    | Realms they belong to  |
| Unauthenticated | None                   |

## Roles

Every user has a **role** within each realm they belong to. Roles are hierarchical — a higher role includes all permissions of lower roles.

### Role capabilities

| Action                 | member | operator | manager | admin | owner | global admin |
| ---------------------- | :----: | :------: | :-----: | :---: | :---: | :----------: |
| View agents in realm   |   ✓    |    ✓     |    ✓    |   ✓   |   ✓   |      ✓       |
| Send intents           |   —    |    ✓     |    ✓    |   ✓   |   ✓   |      ✓       |
| Approve tool requests  |   —    |    —     |    ✓    |   ✓   |   ✓   |      ✓       |
| Create/edit workflows  |   —    |    —     |    —    |   ✓   |   ✓   |      ✓       |
| Manage realm users     |   —    |    —     |    —    |   ✓   |   ✓   |      ✓       |
| Manage realm agents    |   —    |    —     |    —    |   ✓   |   ✓   |      ✓       |
| Create/manage policies |   —    |    —     |    —    |   —   |   —   |      ✓       |
| Delete realm           |   —    |    —     |    —    |   —   |   ✓   |      ✓       |
| Manage global settings |   —    |    —     |    —    |   —   |   —   |      ✓       |

### Assigning roles

Roles are managed through the dashboard or API. Only realm admins (or global admins) can assign roles within their realm.

```bash
# Add a user to a realm with a specific role
curl -X POST https://vaultysclaw.acme.internal/api/realms/eng/members \
  -H "Content-Type: application/json" \
  -d '{
    "userDid": "did:vaultys:z6Mkf...",
    "role": "operator"
  }'
```

## Capability grants

Beyond realm roles, **capability grants** provide fine-grained control over which users can invoke which agents with which capabilities.

A user with the `operator` role in a realm can send intents — but only if they have an explicit grant for the target capability.

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
Global admins bypass capability grant checks. For all other roles, both a realm role and a capability grant are required to send intents.
:::

## Default realm

Every Vaultys Claw installation has a **default realm** created on first boot. Agents that register without specifying a realm are placed in the default realm. You can rename and re-colour it, but it cannot be deleted.

## Agent membership

Agents can belong to **one or more realms**. An agent's primary realm determines which users can manage it by default. Membership in additional realms extends visibility to users in those realms.

```bash
# Assign an agent to an additional realm
curl -X POST https://vaultysclaw.acme.internal/api/realms/research/agents \
  -d '{ "agentDid": "did:vaultys:z6Mkf..." }'
```
