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
    DB[("SQLite\nDatabase")]
    VID_CP["VaultysId ⬡"]

    UI --> DB
    API --> DB
    WS --> DB
    VID_CP -.signs.-> WS
    VID_CP -.signs.-> API
  end

  subgraph LiteLLM["LiteLLM Proxy (optional)  :4000"]
    Router["Model Router"]
    Keys["Virtual Keys\n(per realm)"]
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

  API -- "register models\ncreate realm keys" --> LiteLLM
  WS -- "WSS signed messages\n+ llm_config push" --> A1
  WS -- "WSS signed messages\n+ llm_config push" --> A2
  WS -- "WSS signed messages\n+ llm_config push" --> A3
  A1 -- "openai-compatible\nvirtual key" --> LiteLLM
  A2 -- "openai-compatible\nvirtual key" --> LiteLLM
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
- Pushes LLM configuration changes and peer grant catalogs

### Dashboard

A React 19 single-page application rendered server-side by Next.js. Provides live visibility over agents, an interactive graph of the trust graph, a chat interface, workflow management, and the admin approval queue.

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
  CP->>A: WS "register_ack" {agentId, policy, delegationCerts, peerGrants}
```

## Database schema

Vaultys Claw uses **SQLite** (via `better-sqlite3`) for zero-ops local deployments. Migrating to PostgreSQL for high-availability production deployments is on the roadmap.

Key tables:

| Table | Purpose |
|---|---|
| `agents` | Registered agent controllers with DID, capabilities, LLM config |
| `users` | Human users with DID, email, admin flag |
| `realms` | Organisational scopes |
| `realm_memberships` | User ↔ realm and agent ↔ realm associations |
| `grants` | Capability grants from users to agents |
| `delegation_certs` | Control-plane-signed delegation certificates |
| `agent_peer_grants` | Agent-to-agent capability grants |
| `policies` | Signed policies pushed to agents |
| `intents` | Intent log with status and results |
| `chat_sessions` | LLM conversation history |
| `workflows` | Workflow definitions and run history |
| `pending_registrations` | Agents awaiting admin approval |
| `model_registry` | Registered LLMs with provider, model ID, and LiteLLM name |
| `model_realm_access` | Which models each realm can access |
| `realm_router_keys` | Per-realm LiteLLM virtual keys and allowed model lists |

## Technology stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Control plane HTTP | Next.js 14+ |
| Authentication | NextAuth.js |
| Database | SQLite / better-sqlite3 |
| WebSocket | ws 8.x |
| Agent HTTP | Express.js |
| Identity | @vaultys/id 3.x |
| Frontend | React 19, Tailwind CSS |
| LLM SDKs | openai, @anthropic-ai/sdk, @google/generative-ai, ollama |
| LLM proxy | LiteLLM (optional, self-hosted) |
| Language | TypeScript 5.x throughout |

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
  DB[("SQLite / PostgreSQL")]
  A1["Agent Node A\non-premises"]
  A2["Agent Node B\nprivate cloud"]

  Internet --> LB
  LB --> CP
  CP --- DB
  CP -- "WSS outbound only" --> A1
  CP -- "WSS outbound only" --> A2
```

Agents always connect **outbound** — no inbound firewall holes required.
