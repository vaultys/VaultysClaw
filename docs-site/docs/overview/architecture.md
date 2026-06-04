---
sidebar_position: 1
title: Architecture
description: A deep dive into how Vaultys Claw is structured and how its components communicate.
---

# Architecture

Vaultys Claw is designed as a **hub-and-spoke** system. A central control plane acts as the hub; any number of agent controllers are the spokes. The connection is always outbound from the agent, which means agents can run behind strict firewalls with no inbound ports exposed.

## Component overview

```mermaid
graph TD
  subgraph CP["Control Plane  :3000 / :8080"]
    UI["Next.js UI\nDashboard :3000"]
    API["REST API\n/api/** :3000"]
    WS["WebSocket Hub\n:8080"]
    CH["Channel Layer\nChannelService · MessageDispatcher\nBridgeFactory"]
    DB[("SQLite\nDatabase")]
    VID_CP["VaultysId ⬡"]
    FSA["FileStorage\nAbstraction"]

    UI --> DB
    API --> DB
    WS --> DB
    CH --> DB
    API --> FSA
    VID_CP -.signs.-> WS
    VID_CP -.signs.-> API
    VID_CP -."encrypts\ncredentials".-> DB
    API --> CH
    CH --> WS
  end

  subgraph FileStorage["File Storage (optional external)"]
    FSFS["Filesystem\ndata/knowledge-files/"]
    S3["S3 / MinIO\nobject store"]
  end

  subgraph LiteLLM["LiteLLM Proxy (optional)  :4000"]
    Router["Model Router"]
    Keys["Virtual Keys\n(per realm)"]
  end

  subgraph Bridges["External Bridges"]
    WHook["Webhook Gateway\nHMAC-SHA256"]
    Teams["Teams Gateway\nGraph API"]
  end

  subgraph A1["Agent Controller"]
    EX1["Executor"]
    LLM1["LLM: GPT-4o"]
    VID1["VaultysId ⬡"]
  end

  subgraph A2["Agent Controller"]
    EX2["Executor"]
    LLM2["LLM: Claude"]
    VID2["VaultysId ⬡"]
  end

  subgraph A3["Agent Controller"]
    EX3["Executor"]
    LLM3["LLM: Ollama"]
    VID3["VaultysId ⬡"]
  end

  FSA -- "default" --> FSFS
  FSA -. "if configured" .-> S3
  API -- "register models\ncreate realm keys" --> LiteLLM
  WS -- "WSS signed messages\n+ channel events" --> A1
  WS -- "WSS signed messages\n+ channel events" --> A2
  WS -- "WSS signed messages\n+ channel events" --> A3
  A1 -- "openai-compatible\nvirtual key" --> LiteLLM
  A2 -- "openai-compatible\nvirtual key" --> LiteLLM
  CH -- "fan-out" --> WHook
  CH -- "fan-out" --> Teams
  WHook -- "incoming\nHMAC-verified" --> CH
  Teams -- "incoming\nBot Framework" --> CH
```

## Control plane

The control plane runs as a **Next.js 14+ application** and serves two concerns simultaneously:

### REST API (`/api/**`)

Provides CRUD endpoints for every resource in the system (agents, policies, intents, realms, users, workflows, tool approvals). All endpoints require authentication via NextAuth.js and enforce role-based access control.

See the full [API Reference](/docs/api/overview).

### WebSocket hub (port 8080)

A persistent WebSocket server that agent controllers connect to. The hub:

- Maintains the registry of connected agents (in-memory + heartbeat tracking)
- Routes signed intents to target agents or broadcasts by capability
- Distributes policy updates and delegation certificates
- Receives signed execution results and stores them
- Handles tool approval requests (agent → control plane → admin → agent)
- Delivers `channel_message_send` events to @mentioned agents

### Dashboard

A React 19 single-page application rendered server-side by Next.js. Provides live visibility over agents, an interactive graph of the trust graph, a chat interface, workflow management, and the admin approval queue.

### File storage

Knowledge file content is decoupled from the SQLite database through a `FileStorage` abstraction layer. Two backends are supported:

| Backend                  | When to use                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| **Filesystem** (default) | Single-node deployments. Files written to `data/knowledge-files/` alongside the database. |
| **S3 / MinIO**           | Multi-node or cloud deployments. Any S3-compatible service — AWS S3, MinIO, Ceph, etc.    |

The active backend is determined at startup from the `settings` table. S3 credentials (access key ID + secret) are stored encrypted, signed with the server's VaultysId — never in environment variables. Switching backends takes effect immediately without a restart; the cached storage singleton is invalidated when configuration is saved.

Uploaded files keep their binary content out of SQLite: the `knowledge_files` table stores a `file_path` key and delegates reads/writes to the active backend. Legacy rows with a `content` BLOB (pre-migration) remain readable through the same abstraction.

## Agent controller

Each agent controller is a **Node.js process** that:

1. **Generates or loads** a VaultysId (persistent across restarts)
2. **Connects** to the control plane WebSocket hub (with auto-reconnect and exponential back-off)
3. **Registers** by sending its name, public key, capabilities, and LLM config
4. **Receives** signed intents, policies, and delegation certificates
5. **Verifies** every intent signature against the control plane's public key
6. **Enforces** policies before executing any action
7. **Signs** execution results and returns them to the control plane

The agent controller also exposes a lightweight HTTP server (default port 3001) for health checks and test endpoints.

## Communication protocol

### WebSocket message envelope

Every message on the WebSocket channel is a JSON object with at minimum:

```json
{
  "type": "<message-type>",
  "payload": { ... },
  "signature": "<base64-encoded-signature>",
  "publicKey": "<sender-public-key>",
  "timestamp": "<ISO-8601>"
}
```

Receiving parties verify `signature` against `payload + timestamp` using `publicKey`. Messages older than a configurable threshold or with invalid signatures are rejected.

### Message flow: intent execution

```mermaid
sequenceDiagram
  participant U as User
  participant CP as Control Plane
  participant A as Agent

  U->>CP: POST /api/intents
  CP->>CP: Sign intent with VaultysId
  CP->>A: WS "intent" (signed)
  A->>A: Verify signature
  A->>A: Check policy & capabilities
  A->>A: Execute action
  A->>A: Sign result
  A->>CP: WS "result" (signed)
  CP-->>U: 202 Accepted
  CP->>CP: Store result in DB
```

### Message flow: agent registration

```mermaid
sequenceDiagram
  participant A as Agent
  participant CP as Control Plane
  participant Admin as Admin

  A->>CP: WS "register" {name, publicKey, capabilities, llmConfig}
  CP->>Admin: Notify pending registration
  Admin->>CP: POST /api/registrations/:id/approve
  CP->>CP: Sign policy with VaultysId
  CP->>A: WS "register_ack" {agentId, policy, delegationCerts}
```

### Message flow: channel @mention → agent response

```mermaid
sequenceDiagram
  participant U as User
  participant CP as Control Plane
  participant MD as MessageDispatcher
  participant A as Agent

  U->>CP: POST /api/channels/ch-1/messages\n{ content: "@my-agent do X" }
  CP->>CP: Persist message
  CP-->>U: 201 Created
  CP->>MD: processMessage(...) [async, fire-and-forget]
  MD->>CP: createThreadReply — acknowledgement
  MD->>A: WS "channel_message_send" { channelId, messageId, threadId }
  A->>A: Execute task
  A->>CP: POST /api/channels/ch-1/messages/agent-response\n{ content: "Done!", threadId }
```

## Database schema

Vaultys Claw uses **SQLite** (via `better-sqlite3`) for zero-ops local deployments. Migrating to PostgreSQL for high-availability production deployments is on the roadmap.

Key tables:

| Table                   | Purpose                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `settings`              | Key-value store for all server configuration (storage type, S3 credentials encrypted, Docling URL, …) |
| `agents`                | Registered agent controllers with DID, capabilities, LLM config                                       |
| `users`                 | Human users with DID, email, admin flag                                                               |
| `realms`                | Organisational scopes                                                                                 |
| `agent_realms`          | Agent ↔ realm associations                                                                            |
| `user_realms`           | User ↔ realm associations                                                                             |
| `user_grants`           | Capability grants from users to agents                                                                |
| `delegation_certs`      | Control-plane-signed delegation certificates                                                          |
| `certificates`          | Agent certificates issued by the control plane                                                        |
| `policies`              | Signed policies pushed to agents                                                                      |
| `pending_registrations` | Agents awaiting admin approval                                                                        |
| `intent_log`            | Dispatched intents with status, payload, and results                                                  |
| `workflows`             | Workflow definitions (steps, schedule, trigger config)                                                |
| `workflow_runs`         | Execution history per workflow                                                                        |
| `workflow_steps`        | Per-step execution log within a run                                                                   |
| `workflow_approvals`    | Human-in-the-loop approval requests                                                                   |
| `knowledge_sources`     | RAG sources per agent (URL, text, file — with sync status)                                            |
| `knowledge_files`       | Uploaded file metadata + `file_path` key into the FileStorage backend                                 |
| `model_registry`        | Registered LLMs with provider, model ID, and LiteLLM name                                             |
| `model_realm_access`    | Which models each realm can access                                                                    |
| `realm_router_keys`     | Per-realm LiteLLM virtual keys and allowed model lists                                                |
| `org_skills`            | Organisation-level skill library entries                                                              |
| `realm_skills`          | Realm-scoped skill overrides                                                                          |
| `agent_skill_overrides` | Per-agent skill configuration                                                                         |
| `channels`              | Named rooms (realm-scoped or global)                                                                  |
| `channel_members`       | User and agent membership with roles                                                                  |
| `channel_messages`      | Persisted messages with optional threading                                                            |
| `channel_bridges`       | External service integrations (webhooks, Teams)                                                       |
| `agent_token_usage`     | Rolling token counters per agent (budget enforcement)                                                 |
| `user_invitations`      | Pending email invitations                                                                             |
| `entra_identities`      | Microsoft Entra ID / Azure AD identity links                                                          |

## Technology stack

| Layer              | Technology                                                  |
| ------------------ | ----------------------------------------------------------- |
| Monorepo           | pnpm workspaces + Turborepo                                 |
| Control plane HTTP | Next.js 14+                                                 |
| Authentication     | NextAuth.js                                                 |
| Database           | SQLite / better-sqlite3                                     |
| File storage       | Filesystem (default) · S3 via @aws-sdk/client-s3 (optional) |
| WebSocket          | ws 8.x                                                      |
| Agent HTTP         | Express.js                                                  |
| Identity           | @vaultys/id 3.x                                             |
| Frontend           | React 19, Tailwind CSS                                      |
| LLM SDKs           | openai, @anthropic-ai/sdk, @google/generative-ai, ollama    |
| LLM proxy          | LiteLLM (optional, self-hosted)                             |
| Language           | TypeScript 5.x throughout                                   |

## Deployment topologies

### Development (single machine)

```mermaid
graph LR
  Dev["Developer\nBrowser"] --> CP["Control Plane\nlocalhost:3000"]
  CP <--> WS["WebSocket Hub\nlocalhost:8080"]
  WS <--> AC["Agent Controller\nlocalhost:3001"]
```

### Production (typical enterprise)

```mermaid
graph TD
  Internet["Internet / Corporate LAN"]
  LB["Load Balancer\nHTTPS / WSS"]
  CP["Control Plane\nHTTPS :443 · WSS :8080"]
  DB[("SQLite")]
  S3["S3 / MinIO\nknowledge files"]
  A1["Agent Node A\non-premises"]
  A2["Agent Node B\nprivate cloud"]

  Internet --> LB
  LB --> CP
  CP --- DB
  CP -. "optional" .-> S3
  CP -- "WSS outbound only" --> A1
  CP -- "WSS outbound only" --> A2
```

Agents always connect **outbound** — no inbound firewall holes required. S3-compatible object storage is optional but recommended when running multiple control-plane replicas or when you want knowledge files managed separately from the database volume.
