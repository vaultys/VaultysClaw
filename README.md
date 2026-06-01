# VaultysClaw

<p align="center">
  <strong>Zero Trust AI Agent Orchestration Platform</strong><br/>
  <em>Enterprise-grade security, governance, and compliance for autonomous AI agents at scale</em>
</p>

<p align="center">
  <a href="https://github.com/vaultys/VaultysClaw/actions"><img src="https://img.shields.io/github/actions/workflow/status/vaultys/VaultysClaw/ci.yml?branch=main&style=for-the-badge" alt="CI"></a>
  <a href="https://github.com/vaultys/VaultysClaw/releases"><img src="https://img.shields.io/github/v/release/vaultys/VaultysClaw?include_prereleases&style=for-the-badge" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/status-foundation%20tier-green?style=for-the-badge" alt="Foundation Tier">
  <a href="ZERO_TRUST_COMPLIANCE.md"><img src="https://img.shields.io/badge/Zero%20Trust-Compliant-blue?style=for-the-badge" alt="Zero Trust Compliant"></a>
</p>

## 💛 Sponsors

> **VaultysClaw is actively looking for sponsors.**  
> We are building the missing security layer for enterprise AI — and we want you to help shape it.

Sponsoring gives your organisation a direct line into the core team and meaningful influence over where the platform goes next.

### What sponsors get

| Tier         | Benefits                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| **Bronze**   | Logo in README & About page · GitHub Sponsors badge                                                            |
| **Silver**   | Everything above · Private Discord channel with core devs · Early access to releases                           |
| **Gold**     | Everything above · Roadmap vote · PoC fast-track (we prototype your use-case first) · Co-marketing opportunity |
| **Platinum** | Everything above · Dedicated support SLA · Architecture review sessions · Custom integration guidance          |

### Why sponsor?

- **Direct roadmap influence** — your production requirements become milestones, not backlog items
- **Fast-track PoCs** — need a specific integration or compliance feature? Gold+ sponsors get it built first
- **Private dev channel** — real-time access to the team; no ticket queue, no waiting
- **Logo placement** — README, control-plane About page, release notes, and future website
- **Compliance head-start** — we brief sponsors on upcoming security changes before public release

📧 **Get in touch**: [sponsor@vaultys.com](mailto:sponsor@vaultys.com)  
💛 **GitHub Sponsors**: [github.com/sponsors/vaultys](https://github.com/sponsors/vaultys)

---

## The Problem

Enterprises are deploying AI agents but have **no idea what they're doing**:
- ❌ Agents run with overly broad permissions → one compromised agent = full breach
- ❌ No audit trail of what agents accessed or why → compliance nightmare  
- ❌ No way to revoke access → credentials leak and stay leaked
- ❌ Shared credentials across agents → can't tell who did what
- ❌ No approval workflows → agents make high-risk decisions in the dark

Traditional identity systems (usernames, passwords, shared API keys) **don't work** for autonomous AI. VaultysClaw applies **Zero Trust principles** from NIST SP 800-207 to solve this.

---

## The Solution: Zero Trust for AI

**VaultysClaw** is the first open-source platform built natively on Zero Trust architecture for AI agents:

✅ **Cryptographic identity** — Every agent gets a unique, non-transferable ID (not a shared API key)  
✅ **Deny-by-default** — Agents have zero permissions until explicitly granted  
✅ **Fine-grained policies** — Express rules like "read DB 9am–5pm on weekdays only"  
✅ **Cryptographic proof** — All actions signed; audit trail is non-repudiable  
✅ **Approval workflows** — High-risk intents routed to humans first  
✅ **Real-time governance** — Monitor agent behavior, revoke access instantly  
✅ **Policy-driven** — Update security posture without touching code  

---

## Why VaultysClaw

### For Enterprises
- **Compliance-Ready**: Foundation tier aligns with SOC 2, HIPAA, GDPR, NIST 800-207, FedRAMP
- **Audit Trail**: Every action tied to the agent identity that took it—no ambiguity
- **Controlled Risk**: Policies define what agents *can't* do; reduce blast radius to minutes, not hours
- **Self-Hosted**: Run on-premise or in your VPC; no data leaving your infrastructure

### For Startups & Builders
- **Drop-in Replacement**: Swap your API key approach for cryptographic identity in hours
- **Monorepo-Ready**: One `pnpm dev` boots the whole stack—control plane, agents, WebSocket server
- **Skills & Tools**: 30+ built-in tools (file ops, shell, HTTP, code runner, remote agents) and 10+ skills
- **Developer-Friendly**: Visual workflow editor + CLI for headless agents + Web UI for real-time monitoring

### Comparison: VaultysClaw vs. The Alternatives

| Feature                             | VaultysClaw | API Keys | OAuth | Traditional RBAC |
| ----------------------------------- | ----------- | -------- | ----- | ---------------- |
| Non-transferable identity           | ✅           | ❌        | ⚠️     | ❌                |
| Deny-by-default permissions         | ✅           | ❌        | ❌     | ⚠️                |
| Cryptographic proof of who-did-what | ✅           | ❌        | ✅     | ❌                |
| Policy-driven (not code-driven)     | ✅           | ❌        | ❌     | ⚠️                |
| Sub-agent isolation                 | ✅           | ❌        | ❌     | ⚠️                |
| Real-time approval workflows        | ✅           | ❌        | ❌     | ❌                |
| Open-source, self-hosted            | ✅           | ⚠️        | ⚠️     | ✅                |

---

## Quick Demo

```bash
# One command. Full stack boots.
pnpm dev

# ✓ Control plane UI at http://localhost:3000
# ✓ Agent web dashboard at http://localhost:3002  
# ✓ WebSocket server ready at ws://localhost:8080
# ✓ Passwordless QR-code login (no passwords!)

# Create an agent in the UI, assign capabilities, deploy.
# Every action is logged. Every permission is audited.
```

---

## Key Features

### 🔐 Zero Trust Foundation
- **VaultysId**: Each agent & user gets a unique, cryptographically-rooted identity (like a passport, not a password)
- **Signed Intents**: All agent work is cryptographically signed; no one can deny what they did
- **Policy Engine**: Express complex rules without touching code: `"allow read_database if time >= 9am AND time <= 5pm AND day != weekend"`
- **Capabilities, Not Credentials**: Agents are granted *capabilities* (e.g., "can read customer DB"), not raw API keys

### 🎛️ Governance Out of the Box
- **Realms**: Multi-tenant namespaces for teams, departments, or customers  
- **Token Budgets**: Daily/monthly spend limits per agent and realm with real-time tracking  
- **Approval Workflows**: Visual editor for routing high-risk intents to humans first  
- **Governance Dashboard**: Real-time posture view—agent coverage, policy violations, budget spend, risk score  
- **Audit Trail**: Every operation (who, what, when, why) with cryptographic proof  

### 🚀 Agent Orchestration
- **Workflow Engine**: Drag-and-drop visual editor (React Flow) with sequential/parallel execution  
- **Skills & Tools**: 30+ built-in integrations (Slack, email, file ops, shell, HTTP, code runner, remote agents, knowledge search)  
- **Semantic Memory**: Persistent agent memory with automatic summarization and retrieval  
- **Multi-Agent Coordination**: Agents delegate tasks to each other via cryptographically-signed peer grants  
- **LiteLLM Registry**: Centrally manage models; agents pick from approved roster instead of holding raw keys  

### 🔌 Enterprise Integrations
- **Microsoft Entra ID**: Auto-sync users and groups from Azure AD  
- **SMTP**: Configurable email notifications  
- **Docker Compose**: Pre-built dev + production stacks  
- **LiteLLM Proxy**: Route requests to any LLM (OpenAI, Anthropic, local models, open-source)  

---

## Compliance & Security

<a href="ZERO_TRUST_COMPLIANCE.md">📋 **Full Zero Trust Compliance Matrix →**</a>

**Current Status**: **Foundation Tier** ✅  
- ✅ Unique cryptographic identity per agent  
- ✅ Deny-by-default permission model  
- ✅ Comprehensive audit logging  
- ✅ Signed policies & intents  
- ✅ Policy-based access control  

**Aligned with**:
- 🏛️ NIST SP 800-207 (Zero Trust Architecture)  
- 📋 SOC 2, HIPAA, GDPR, FedRAMP readiness  
- 🔒 Anthropic's "Zero Trust for AI Agents" framework  

**Production Gaps** (Enterprise Tier):
- Output filtering (prevent credential leaks)  
- Automated behavioral response (auto-revoke on anomaly)  
- ML-based anomaly detection  
- Container-based agent isolation  

[See full roadmap →](ZERO_TRUST_COMPLIANCE.md#summary-table-implementation-roadmap)

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────┐
│        VaultysClaw Control Plane (Next.js)              │
│  Dashboard • Workflow Editor • Policy Engine • Audit    │
│         SQLite • WebSocket Server (port 8080)            │
└────────────────┬────────────────────────────────────────┘
                 │ (Signed Intents + Policies)
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌────────┐
│ Agent  │  │ Agent  │  │ Agent  │
│   #1   │  │   #2   │  │   #N   │  ← Lightweight. Any LLM.
│(Node.js)  │(Node.js)  │(Node.js)     Cryptographic ID.
│ Crypto ID │ Crypto ID │ Crypto ID
│ 30+ Tools │ 30+ Tools │ 30+ Tools
└────────┘  └────────┘  └────────┘
```

Each agent:
- Holds a unique VaultysId (like a cryptographic passport)  
- Connects to control plane over WebSocket  
- Receives signed policy updates & intents  
- Reports actions back for audit trail  
- Can delegate tasks to peer agents  

---

## Getting Started

**Requirements**: Node.js 18+, pnpm 10+

```bash
git clone https://github.com/vaultys/VaultysClaw.git
cd VaultysClaw
pnpm install
pnpm dev
```

Visit **http://localhost:3000** and scan the QR code to set up your first identity (no password needed).

---

## How It's Different

| Aspect                 | VaultysClaw                              | Traditional Approaches          |
| ---------------------- | ---------------------------------------- | ------------------------------- |
| **Agent Identity**     | Cryptographic (non-transferable)         | Shared API keys or OAuth tokens |
| **Permission Model**   | Deny-by-default capabilities             | Allow-by-default or loose RBAC  |
| **Audit**              | Cryptographically-signed, non-repudiable | Text logs (easily tampered)     |
| **Governance**         | Policy-engine-driven (no code deploy)    | Hardcoded in agent logic        |
| **Compliance**         | Built-in (SOC 2, HIPAA-ready)            | Bolted on later                 |
| **Approval Workflows** | Native (visual, real-time)               | Manual, ad-hoc                  |

---

## Use Cases

- **Regulatory compliance**: Healthcare, finance, government agencies needing audit trails and approval workflows  
- **Multi-team orchestration**: Engineering, sales, ops teams running agents without stepping on each other  
- **Sensitive data handling**: Agents that touch customer data, credentials, or PII with zero-trust controls  
- **Autonomous backends**: Replace microservices with agents; policy defines their behavior, not code  
- **Controlled experimentation**: Test new agent behaviors with time-limited, capability-limited deployments  

---

## Roadmap

**Phase 1–3**: ✅ Complete (identity, security, orchestration)  
**Phase 4**: 🟡 In Progress (integrations, governance, scale)  
**Phase 5**: 🔲 Planned (documentation, enterprise hardening, SaaS option)

[Full roadmap →](README.md#roadmap)

---

## Resources

- **[Zero Trust Compliance Matrix](ZERO_TRUST_COMPLIANCE.md)** — Full feature checklist vs. Anthropic framework  
- **[VaultysId](https://github.com/vaultys/id)** — Decentralized identity framework  
- **[Contributing](README.md#contributing)** — Help us harden the platform  

---

## Community & Support

- 💬 Discussions: Open GitHub issues  
- 🐛 Bugs: GitHub Issues  
- 📧 Email: fx.thoorens@vaultys.com  

---

[Getting Started](#getting-started) · [Architecture](#architecture-at-a-glance) · [Compliance](ZERO_TRUST_COMPLIANCE.md) · [Contributing](#contributing)

---

## Core Features Breakdown

### 🔐 Security & Compliance
- **Cryptographic Identity** — Each agent and user holds a unique, non-transferable [VaultysId](https://github.com/vaultys/id); impossible to impersonate
- **Deny-by-Default Model** — Agents have zero permissions; capabilities are explicitly granted  
- **Signed Intents & Policies** — Cryptographic signatures on all operations; agents reject unsigned messages  
- **Peer Grants** — Agents can securely delegate capabilities to other agents via signed certificates  
- **Zero Trust Ready** — Aligns with NIST SP 800-207, Anthropic's AI agent security framework  

### 🎛️ Governance & Control
- **Realms** — Multi-tenant namespaces: separate teams, departments, or customer tenants with isolated policies  
- **Policy Engine** — Express rules without code: `"agent can read DB on weekdays 9am–5pm"`  
- **Token Budgets** — Daily/monthly spend limits per agent and realm; real-time tracking  
- **Approval Workflows** — Visual editor for routing high-risk intents through human approval first  
- **Governance Dashboard** — Real-time posture: agent coverage, policy violations, risk scoring, budget spend  

### 🚀 Orchestration & Integration
- **Workflow Engine** — React Flow visual editor with sequential/parallel execution, loops, and human approval steps  
- **Skills & Tools** — 30+ built-in integrations: file ops, shell, HTTP, code runner, remote agents, knowledge search, Slack, email  
- **Agent Memory** — Persistent semantic memory with auto-summarization; agents learn from past interactions  
- **LiteLLM Registry** — Centrally manage any LLM (OpenAI, Anthropic, Llama, local models) with per-realm access  
- **Entra ID Sync** — Auto-pull users and groups from Azure AD; groups map to realms automatically  
- **Multi-Agent Coordination** — Agents communicate and delegate via cryptographically-signed peer grants  

### 🏗️ Developer Experience
- **Monorepo Stack** — pnpm workspaces + Turborepo; one `pnpm dev` boots everything  
- **Multiple UIs** — Web dashboard (React/Vite) or terminal dashboard (Ink TUI) for agent control  
- **Type-Safe APIs** — Standardized response types and validation across all endpoints  
- **30+ Built-in Tools** — No need to write glue code for common tasks  
- **Docker Compose** — Pre-configured dev and production stacks  

---

## Recent Improvements (May 2026)

### Code Quality & Maintainability
- **Shared utilities library** — Centralized formatting, colors, and error handling utilities to eliminate duplication
- **Reusable UI components** — Avatar, Badge, and Modal components in shared library for consistent UI
- **API type safety** — Standardized response types and query parameter schemas for all endpoints
- **Comprehensive tests** — 38+ tests for utilities, APIs, and critical functionality
- **API documentation** — Full endpoint documentation with parameters and examples
- **Build system fixes** — Fixed Mastra v1.35.0 compatibility issues in agent-controller

### Developer Experience
- New npm scripts for common workflows (`pnpm agent:web`, `pnpm agent:tui`, `pnpm test:ui`)
- Test UI dashboard for interactive test running
- Improved error messages and validation

### Architecture Improvements
- Reduced code duplication by ~30% through utility extraction
- Consistent patterns across control plane and agent controller
- Better type safety with centralized type definitions
- Faster TypeScript compilation through reduced duplication

See [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) for detailed changes.

---

## Quick Start

**Requirements**: Node.js 18+, pnpm 10+

```bash
git clone https://github.com/vaultys/VaultysClaw.git
cd VaultysClaw
pnpm install
pnpm dev
```

That's it. In 30 seconds:

| Service                | URL                   | What                                |
| ---------------------- | --------------------- | ----------------------------------- |
| 🎛️ **Control Plane**    | http://localhost:3000 | Dashboard, policies, audit logs     |
| 🤖 **Agent Dashboard**  | http://localhost:3002 | Real-time agent monitoring          |
| 🔗 **WebSocket Server** | ws://localhost:8080   | Agent ↔ Control plane communication |

**First Steps:**
1. Visit http://localhost:3000
2. Scan the QR code to create your identity (passwordless, via VaultysId app)
3. Deploy an agent in the dashboard
4. Watch it execute tasks with cryptographically-signed audit trail

**Try it in 5 minutes:**
```bash
# In a second terminal, spawn 3 agents automatically
pnpm agent:spawn 3

# Watch them in the dashboard at http://localhost:3000
```

---

## What You Get Immediately

✅ **Out-of-the-box security** — No config needed; Zero Trust is the default  
✅ **Visual workflow editor** — Drag, drop, deploy; no code required  
✅ **Real-time governance** — See what agents are doing, approve risky actions  
✅ **Audit everything** — Every action tied to agent identity; non-repudiable proof  
✅ **Approval workflows** — Route high-stakes decisions through humans  
✅ **Token budgets** — Spend limits prevent runaway costs  
✅ **30+ tools built-in** — File ops, shell, HTTP, code runner, remote agents, knowledge search  

No plugins to install. No keys to manage. No shared credentials. Just deploy and govern.

---

## Architecture

### The Big Picture

VaultysClaw separates **control** (governance, policies) from **execution** (agents, tools). Control plane owns the policies; agents own the decisions. This decentralization enables Zero Trust at scale.

```
VaultysClaw/
├── packages/
│   ├── shared/                      # Shared types, utilities, and error classes
│   │   ├── src/
│   │   │   ├── types.ts             # Core types (agents, users, policies, workflows)
│   │   │   ├── utils/
│   │   │   │   ├── formatting.ts    # Time, uptime, and display formatting
│   │   │   │   ├── colors.ts        # Status and log-level color mappings
│   │   │   │   └── index.ts         # Shared utility exports
│   │   │   └── errors.ts            # Centralized error classes
│   │   └── dist/
│   │
│   ├── control-plane/               # Next.js dashboard + WebSocket server
│   │   ├── app/                     # Next.js App Router pages & API routes
│   │   ├── components/
│   │   │   ├── shared/              # Reusable UI components (Avatar, Badge, Modal)
│   │   │   ├── channels/            # Channel-specific components
│   │   │   ├── workflow/            # Workflow editor and visualization
│   │   │   └── ...                  # Other feature components
│   │   ├── lib/
│   │   │   ├── api-types.ts         # Standardized API response types
│   │   │   ├── api-docs.ts          # API query parameter schemas
│   │   │   ├── hooks/               # React hooks (useNameResolution)
│   │   │   ├── db/                  # Database access objects (DAOs)
│   │   │   ├── auth.ts              # Authentication logic
│   │   │   ├── workflow-executor.ts # Workflow execution engine
│   │   │   └── ...                  # Other utilities
│   │   └── web-app/                 # (Agent) Vite React UI (chat, runs, overview)
│   │
│   └── agent-controller/            # Agent runtime (Node.js / Bun)
│       ├── src/
│       │   ├── agent.ts             # Core agent controller class
│       │   ├── llm.ts               # LLM integration (Mastra)
│       │   ├── tools/               # Built-in tools (file-ops, shell, http, etc.)
│       │   ├── skills/              # Skill loader and management
│       │   ├── memory/              # Semantic memory system
│       │   ├── scheduler.ts         # Cron-style task scheduling
│       │   ├── task-queue.ts        # Intent execution queue
│       │   ├── knowledge/           # Knowledge base integration
│       │   ├── peer-manager.ts      # Agent-to-agent communication
│       │   ├── db.ts                # Database initialization
│       │   └── ...                  # Other modules
│       ├── web-app/                 # Vite React UI (chat, runs, overview)
│       └── web-launcher.ts          # Agent web server entry point
│
├── docs-site/                       # Docusaurus documentation site
├── docker/                          # Dockerfiles
├── docker-compose.litellm.yml       # LiteLLM sidecar stack
├── REFACTORING_SUMMARY.md           # Recent refactoring documentation
├── turbo.json
└── package.json                     # pnpm workspaces root
```

### Shared Package (`@vaultysclaw/shared`)
- **Types**: Core domain types for agents, users, policies, workflows, intents, realms
- **Utilities**: 
  - Formatting: `fmtUptime()`, `formatTime()`, `getInitials()`, `shortDid()`
  - Colors: Status and log-level color mappings for terminal/UI
- **Errors**: Centralized error classes (`LlmNotConfiguredError`, `ValidationError`, etc.)
- Used by both control plane and agent controller

### Control Plane (`@vaultysclaw/control-plane`)
- **Next.js** App Router + Tailwind CSS dashboard
- **VaultysId** — passwordless QR-code authentication; no passwords stored
- **WebSocket server** (port 8080) — real-time agent heartbeats, intent dispatch, admin push
- **SQLite** — full persistence: agents, users, realms, policies, workflows, intent log, token usage history, audit activity log
- **Realms** — multi-tenant namespaces with per-realm model access, user membership, skill catalogs, and token budgets
- **Users** — role-based (admin/member), hierarchy (`reports_to`), email, Entra ID linkage, delegation certificates
- **Workflow engine** — visual editor, sequential/parallel node execution, human approval steps, run history
- **LiteLLM integration** — model registry with realm-scoped virtual keys and request routing
- **Entra ID sync** — Azure AD group → realm mapping via MS Graph API (client credentials flow)
- **Governance API** — posture summary: agent coverage, high-risk capabilities, budget violations, intent/approval stats
- **SMTP** — configurable email notifications
- **Shared UI Library** — Reusable components (Avatar, Badge, Modal) for consistent UI
- **Standardized APIs** — All responses use consistent `ListResponse`, `ErrorResponse` types with pagination

### Agent Controller (`@vaultysclaw/agent-controller`)
- Lightweight Node.js service; optional Bun runtime for SQLite shim
- Connects to the control plane via a persistent WebSocket
- **Web UI** (port 3002) — React/Vite app with Chat, Runs, and Overview panels
- **TUI** — Ink-based terminal dashboard
- **Skills** — plugin architecture; built-in: `calculator`, `json-api`, `web-scraper`
- **Tools** — `file-ops`, `http-request`, `shell`, `code-runner`, `remote-agent`
- **Memory** — persistent semantic store with retrieval and summarization
- **Scheduler** — cron-style task scheduling
- **Task queue** — concurrent intent execution with back-pressure
- **Knowledge system** — file ingestion and semantic search with tool interface
- **Peer grant verification** — verifies cryptographic capability grants from the control plane before acting
- **LLM support** — local models, OpenAI, Anthropic, or any OpenAI-compatible endpoint (via Mastra)

### Security Layer
- VaultysId for non-transferable, decentralized identity (users and agents)
- Passwordless authentication via QR code + VaultysId mobile app
- Certificate-based delegation (`delegation_certs` table)
- Peer grants — signed capability delegation between agents
- Policy-based capability grants — signed by the control plane
- Intent log — full audit trail of every intent sent and result received
- Activity log — server-side audit of all admin operations

### Knowledge & Memory System
- File ingestion for building knowledge bases
- Semantic search with vector embeddings
- Conversation memory with automatic summarization
- Multi-agent knowledge sharing through peer tools

### Code Organization
- **Shared utilities** (`@vaultysclaw/shared`) — formatting, colors, error handling
- **Reusable components** (`components/shared/`) — Avatar, Badge, Modal
- **Type-safe APIs** (`lib/api-types.ts`) — standardized request/response formats
- **Comprehensive tests** — 38+ tests covering utilities, APIs, and components
- **Consistent patterns** — established conventions for routing, data access, component structure

---

## Configuration

### Control Plane
```env
PORT=3000
WS_PORT=8080
DATABASE_URL=sqlite:./data.db
VAULTYS_ID_PATH=./.vaultys/control-plane.id
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=http://localhost:3000

# Optional: Microsoft Entra ID sync
ENTRA_TENANT_ID=<tenant-id>
ENTRA_CLIENT_ID=<client-id>
ENTRA_CLIENT_SECRET=<client-secret>

# Optional: SMTP notifications
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=<password>

# Optional: LiteLLM proxy
LITELLM_BASE_URL=http://localhost:4000
LITELLM_MASTER_KEY=<master-key>
```

### Agent Controller
```env
AGENT_NAME=agent-1
CONTROL_PLANE_URL=http://localhost:3000
CONTROL_PLANE_WS_URL=ws://localhost:8080   # or set WS_HOST + WS_PORT
WEB_PORT=3002

# LLM — pick from an approved model in the control plane registry, or configure directly:
LLM_MODEL=gpt-4o
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1    # optional, for OpenAI-compatible endpoints

VAULTYS_ID_PATH=./.vaultys/agent.id       # or AGENT_VAULTYS_ID_PATH
```

---

## Development

### Quick Start
```bash
# Start everything (control plane + agent controller)
pnpm dev

# Visit control plane at http://localhost:3000
# Agent web UI at http://localhost:3002
# WebSocket at ws://localhost:8080
```

### Available Commands
```bash
# -- Development --
pnpm vaultysclaw:dev          # Control plane only
pnpm agent:dev                # Agent controller (headless)
pnpm agent:web                # Agent web UI
pnpm agent:tui                # Agent terminal dashboard
pnpm agent:spawn 3            # Spawn 3 agents with auto-naming

# -- Build --
pnpm build                    # Production build (all packages)
pnpm agent:build:binaries     # Build native agent binaries

# -- Testing --
pnpm test                     # Run all tests (headless)
pnpm test:ui                  # Vitest UI dashboard
pnpm test:components          # Component tests
pnpm test:coverage            # Coverage report
pnpm test:packages            # Tests within each package
pnpm test:docker              # Tests in Docker environment
pnpm test:litellm             # LiteLLM integration tests

# -- Code Quality --
pnpm lint                     # ESLint across all packages
pnpm type-check               # TypeScript checks
pnpm format                   # Prettier formatting

# -- Cleanup --
pnpm clean                    # Remove build artifacts and node_modules
```

### Target Single Package
```bash
pnpm dev --filter @vaultysclaw/control-plane
pnpm dev --filter @vaultysclaw/agent-controller
pnpm build --filter @vaultysclaw/shared
```

### Docker
```bash
# Full stack with LiteLLM
docker compose -f docker-compose.litellm.yml up

# Test environment
docker compose -f docker-compose.test.yml up
```

### Environment Setup
Each package can have its own `.env` file. See [Configuration](#configuration) above for details.

---

## Security by Default

VaultysClaw doesn't bolt security on afterward—it's the foundation. Built on three Zero Trust principles:

### 1️⃣ Never Trust, Always Verify
- Every intent is cryptographically signed by the agent that created it
- Control plane verifies signature before accepting any work
- Agents verify that policies are signed by control plane before obeying them
- Peer-to-peer agent calls are cryptographically verified

### 2️⃣ Assume Breach
- Agents are assumed compromised; policies define what they *can't* do
- One compromised agent ≠ full breach; its blast radius is constrained by policy
- Revoke access in milliseconds; no waiting for certificates to expire
- Credentials are per-agent; breach of one doesn't compromise others

### 3️⃣ Verify Every Access
- Identity: Each agent has a unique, non-transferable VaultysId (impossible to impersonate)
- Authentication: Passwordless QR-code login; no passwords stored
- Authorization: Every action checked against policies before execution
- Audit: Full trail—who, what, when, why—cryptographically signed

**Result**: Non-repudiation. You *know* who did what and can prove it.

---

## Technical Details

- **VaultysId**: Decentralized, non-transferable cryptographic identity for agents and users
- **Signed Intents**: All agent work wrapped in EdDSA + PQC signatures; tamper-evident
- **Policy Engine**: Expression-based rules evaluated at runtime; no code deploy needed
- **Capability Model**: Agents have capabilities (e.g., `read_database`), not credentials
- **Peer Grants**: Agents delegate via signed certificates verified at execution
- **Intent Log**: Full audit trail—every operation, every result, every error
- **Activity Log**: Server-side audit of admin actions (policy changes, approvals, etc.)

---

## Roadmap: Zero Trust Maturity Journey

See **[ZERO_TRUST_COMPLIANCE.md](ZERO_TRUST_COMPLIANCE.md)** for detailed feature matrix and priority quick wins.

### Phase 1 — Foundation ✅ **COMPLETE**
Zero Trust principles implemented; production-ready for most deployments.
- [x] Cryptographic identity (VaultysId) per agent & user
- [x] Deny-by-default permission model
- [x] Signed intents and policies
- [x] Non-repudiable audit trail
- [x] Capability-based access control
- [x] Monorepo (pnpm + Turborepo), full-stack development

### Phase 2 — Security & Identity ✅ **COMPLETE**
Enterprise security controls implemented.
- [x] Peer grant verification (agent-to-agent delegation)
- [x] Policy engine (expression-based rules)
- [x] Intent log + activity log (full audit)
- [x] Certificate-based user delegation
- [x] Token lifecycle management

### Phase 3 — Orchestration ✅ **COMPLETE**
Workflow automation and multi-agent coordination.
- [x] Visual workflow editor (React Flow)
- [x] Sequential/parallel execution
- [x] Human-in-the-loop approval steps
- [x] Task queue & scheduler
- [x] Multi-agent peer tools
- [x] Semantic memory system
- [x] Conditional branches (basic)

### Phase 4 — Enterprise Integration 🟡 **IN PROGRESS**
Governance, compliance, and scale.
- [x] LiteLLM model registry with realm isolation
- [x] Microsoft Entra ID (Azure AD) sync
- [x] Token budgets & spend tracking
- [x] Governance posture dashboard
- [x] Realms (multi-tenant support)
- [x] Docker Compose environments
- [x] Code quality (shared utils, types, components)
- [x] 40+ test coverage
- [ ] **Output filtering** (prevent credential leaks) — **HIGH PRIORITY**
- [ ] Automated behavioral response (auto-revoke on anomaly)
- [ ] Immutable audit logs with cryptographic verification
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Advanced anomaly detection

### Phase 5 — Advanced & Documentation 🔲 **PLANNED**
Enterprise hardening, SaaS option, community growth.
- [ ] ML-based behavioral analysis
- [ ] Container isolation per agent
- [ ] Hardware isolation (confidential computing)
- [ ] SIEM integration
- [ ] API reference & tutorials
- [ ] Video walkthroughs
- [ ] Community templates & examples
- [ ] Managed SaaS option

---

## What We Need (How You Can Help)

### 🌟 Help Us Grow
- **Star the repo** — Signals to the community that this matters
- **Share your use case** — Tell us how you're using VaultysClaw (issues, discussions, Twitter)
- **Feedback on governance** — What policies would you need for your organization?

### 🔐 Security Hardening
- **Penetration testing** — Find vulnerabilities in the Zero Trust model
- **Output filtering** — Implement pattern-based detection of leaking credentials/PII
- **Behavioral detection** — ML models for anomaly detection
- **Code audit** — Security-focused review of core modules

### 🛠️ Quick Wins (1–5 days each)
1. **Output filtering MVP** — Regex-based secret detection before results returned
2. **Baseline establishment** — Document expected agent behavior profiles
3. **Configuration versioning** — Store policy snapshots for rollback
4. **Behavioral alerting** — Alert on token usage spikes, unusual tool calls
5. **Audit trail enhancement** — Immutable logging with tamper detection

### 📚 Documentation & Examples
- **Compliance guides** — HIPAA, GDPR, SOC 2, FedRAMP checklists
- **Video tutorials** — Setup, deployment, policy writing
- **Community examples** — Slack bot, email agent, data pipeline agents
- **API reference** — Full endpoint documentation

### 🚀 Advanced Features
- **ABAC (Attribute-Based Access Control)** — Time, location, risk-score-aware policies
- **Distributed tracing** — OpenTelemetry integration for multi-agent workflows
- **Container isolation** — Run agents in per-realm Docker containers
- **Hardware isolation** — Confidential computing support (AMD SEV, Intel TDX)

**Guidelines**
- Open an issue before starting significant work
- Follow patterns in [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md)
- Add tests for new functionality
- Update types and documentation
- Target feature branches, not `main`

---

## Join the Community

- 💬 **Discussions**: GitHub Issues & Discussions  
- 🐛 **Report bugs**: GitHub Issues  
- 📧 **Email**: dev@vaultys.com 

---

## Acknowledgments

Built on:
- [VaultysId](https://github.com/vaultys/id) — Decentralized identity
- [Anthropic's Zero Trust for AI Agents](https://www.anthropic.com/) — Security framework
- [NIST SP 800-207](https://csrc.nist.gov/publications/detail/sp/800-207/final) — Zero Trust Architecture
- Open-source: Next.js, React, Turborepo, SQLite, LiteLLM, Mastra

---

## License

[MIT](./LICENSE) © François-Xavier Thoorens · [VaultysId](https://github.com/vaultys) contributors
