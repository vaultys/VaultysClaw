---
sidebar_position: 2
title: Core Concepts
description: The fundamental building blocks of Vaultys Claw.
---

# Core Concepts

This page explains the key abstractions that underpin Vaultys Claw. Understanding these will help you make better architectural decisions when deploying agents in your organisation.

## VaultysId

A **VaultysId** is a decentralised identifier (DID) paired with a cryptographic key pair. Every participant in the system — the control plane, each agent, and every human user — has a VaultysId.

Key properties:

- **Non-transferable** — the private key never leaves the process that generated it
- **Self-sovereign** — no central authority issues or revokes identities
- **Offline-verifiable** — any holder of the signer's public key can verify signatures without a network round-trip

See [VaultysId Security](/docs/security/vaultys-id) for a deep dive.

## Agent

An **agent** is a running instance of the `agent-controller` package. It:

- Maintains a persistent VaultysId
- Holds a set of granted **capabilities**
- Is configured with one LLM provider and model
- Connects to the control plane via a persistent WebSocket

Agents are the workers of the system. They receive intents, verify their authenticity, and execute the requested actions within their policy boundaries.

## Intent

An **intent** is the primary unit of work. It represents a signed, structured request to execute a named action on one or more agents.

```typescript
interface Intent {
  id: string;           // Unique ID (for replay prevention)
  agentId?: string;     // Target agent DID (or null for broadcast)
  action: string;       // e.g. "summarise_document", "send_email"
  params: Record<string, any>;
  timestamp: string;    // ISO 8601 (for freshness checks)
  signature: string;    // Signed by the issuer's VaultysId
  publicKey: string;
}
```

The control plane signs all intents before forwarding them to agents. Agents **reject** any intent whose signature is invalid or whose timestamp is stale.

## Policy

A **policy** is a governance record that grants an agent a set of capabilities and optional resource limits. Policies are created by global admins through the Governance dashboard or the REST API.

What makes policies different from a simple access-control list is *how* they are delivered: the capabilities and resource limits are **embedded inside the VaultysId Challenger certificate** that both the control plane and agent co-sign during the auth handshake. The agent reads them from the signed certificate — they cannot be forged, replayed, or tampered with in transit.

```typescript
// Fields embedded in ctx.metadata.pk2 of the Challenger certificate
interface PolicyMeta {
  capabilities: AgentCapability[];      // what the agent may do
  resourceLimits?: {
    maxTokensPerDay?: number;           // LLM token budget (prompt + completion)
    maxRequestsPerHour?: number;        // rolling intent rate limit
    allowedDomains?: string[];          // advisory outbound domain list
  } | null;
  policyId?: string | null;            // back-reference to the DB record
  policyExpiresAt?: string | null;     // ISO 8601 — agent blocks intents after this
}
```

Whenever a policy is created or revoked, the control plane sends an `update_capabilities` message followed by a fresh `auth_challenge`. The new certificate carries the updated metadata, signed by both parties.

See [Governance Guide](/docs/guides/governance) for a full walkthrough.

## Capability

A **capability** is a specific permission. The current capability set is:

| Capability | Description |
|---|---|
| `file_access` | Read and write files within the agent's workspace |
| `internet_access` | Make outbound HTTP requests |
| `browser_control` | Control a headless browser |
| `api_call` | Call external APIs |
| `mail_send` | Send email |
| `code_execution` | Run arbitrary code |
| `system_command` | Execute shell commands |
| `agent_communication` | Send requests to peer agents |

Capabilities are granted per agent and can be revoked instantly from the control plane without restarting the agent.

## Realm

A **realm** is an organisational scope. Think of it as a namespace for agents, users, and workflows that belong to the same team, department, or project.

Realms provide:

- **Isolation** — users in realm A cannot see agents or workflows in realm B (unless they are global admins)
- **Role-based access** — each user has a role within each realm they belong to
- **Grouping** — intents can be broadcast to all agents in a realm

Every realm has a human-readable name, a URL-friendly slug, and an optional colour for display purposes.

## Role

Roles are assigned per realm:

| Role | Permissions |
|---|---|
| `owner` | Full control of the realm including deleting it |
| `admin` | Manage agents, users, workflows within the realm |
| `manager` | Supervise operators; approve tool requests |
| `operator` | Execute workflows, send intents |
| `member` | View-only access |

A user can be a **global admin** which grants full access across all realms.

## Grant

A **grant** is an explicit authorisation given to a user that allows them to invoke agents with specific capabilities. Non-admin users cannot send intents without a matching grant.

Grants can be:
- Scoped to a **specific agent** or to **all agents** (null target)
- Scoped to one or more **capabilities**
- Set with an optional **expiry time**

## Delegation Certificate

A **delegation certificate** is a grant that has been cryptographically signed by the control plane and distributed to agents. This allows agents to verify authorisation **offline** — without querying the control plane at execution time.

The certificate proves: _"The control plane vouches that user X may invoke this agent with capabilities Y until time Z."_

## Workflow

A **workflow** is a named, reusable sequence of steps that can involve one or more agents. Workflows can be:

- Triggered **on demand** via the API or dashboard
- Triggered by **events** (e.g. webhook, schedule)
- Parameterised with **variables**

Workflows belong to a realm and inherit its access control.

## Skill

A **skill** is a named unit of reusable agent behaviour attached to a realm. Each skill can carry:

- **Markdown instructions** (`content`) — injected verbatim into the agent's system prompt at the end, separated by `---` dividers
- **Config JSON** — arbitrary metadata forwarded alongside the skill for future tool integrations
- An `isRequired` flag — when set, the skill is always active and agents cannot opt out

Skills are managed from the **Skills** page in the control plane (global admin only) or via the REST API. They can also be imported from the [skills library](https://skills-library.com), which provides a curated catalogue of pre-built `SKILL.md` files hosted on GitHub.

When an agent connects, the control plane pushes a `skills_config` message over the WebSocket. Any time a skill is created, updated, or deleted, connected agents in that realm receive the updated configuration immediately.

See [Skills Guide](/docs/guides/skills) for a full walkthrough.

## Tool Approval

Certain sensitive tools can be configured to require **admin approval** before an agent executes them. When an agent encounters such a tool, it pauses and sends an approval request to the control plane. An admin sees the request in the dashboard and can approve or reject it with a reason. A full audit trail is maintained.
