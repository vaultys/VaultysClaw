# VaultysClaw

<p align="center">
  <strong>Decentralized AI Agent Orchestration Platform</strong>
</p>

<p align="center">
  <a href="https://github.com/vaultys/VaultysClaw/actions"><img src="https://img.shields.io/github/actions/workflow/status/vaultys/VaultysClaw/ci.yml?branch=main&style=for-the-badge" alt="CI"></a>
  <a href="https://github.com/vaultys/VaultysClaw/releases"><img src="https://img.shields.io/github/v/release/vaultys/VaultysClaw?include_prereleases&style=for-the-badge" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/status-alpha-orange?style=for-the-badge" alt="Alpha">
</p>

**VaultysClaw** is a secure, self-hosted platform for orchestrating AI agents across your organization. A single control plane distributes signed policies and intents to lightweight agent controllers via WebSocket — all identities backed by [VaultysId](https://github.com/vaultys/id), a decentralized, non-transferable identity framework.

[Getting Started](#quick-start) · [Architecture](#architecture) · [Roadmap](#roadmap) · [Security](#security) · [Contributing](#contributing)

---

## Highlights

- **Decentralized identity** — every user and agent holds a unique, non-transferable [VaultysId](https://github.com/vaultys/id); authentication is passwordless via QR code.
- **Realms** — multi-tenant namespaces that group users, agents, and models; each realm controls its own LLM access and skill catalog.
- **Workflow engine** — visual drag-and-drop editor (React Flow) with sequential/parallel execution, human-in-the-loop approval steps, and a live approval inbox.
- **LiteLLM model registry** — centrally manage models with per-realm virtual keys and request routing; agents pick from an approved registry rather than holding raw API keys.
- **Entra ID sync** — pull users and groups from Microsoft Azure AD via MS Graph API; groups map automatically to realms.
- **Token budgets** — daily and monthly token limits per agent and per realm, with live usage tracking and governance alerts.
- **Governance posture** — dashboard surfacing high-risk agents, uncovered policies, budget violations, and intent success rates.
- **Skills & tools** — agent controllers expose a plugin-based skill system (calculator, JSON API, web scraper built-in) plus built-in tools for file ops, shell, HTTP, and code execution.
- **Agent memory** — each agent controller maintains a persistent semantic memory (store, retrieval, summarizer).
- **Peer grants** — cryptographically signed agent-to-agent capability delegation, verified at execution time.
- **Monorepo, zero friction** — pnpm workspaces + Turborepo; one command starts the whole stack.

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

**Runtime: Node.js 18+ · pnpm 10+**

```bash
# Install dependencies
pnpm install

# Start the full stack (control plane + agent controller)
pnpm dev
```

| Service | URL |
|---|---|
| Control Plane | http://localhost:3000 |
| Agent Web UI | http://localhost:3002 |
| WebSocket | ws://localhost:8080 |

On first run, visit the control plane to complete initial setup — scan the QR code with the VaultysId app to create your admin identity.

---

## Architecture

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

## Security

1. **Identity**: Each user and agent holds a unique, non-transferable VaultysId — identity cannot be copied or delegated.
2. **Authentication**: Passwordless QR-code login backed by VaultysId; no password hashes stored.
3. **Policies**: Signed by the control plane; agents reject any unsigned or tampered policy.
4. **Peer grants**: Cryptographic capability delegation between agents, verified at execution time.
5. **Delegation**: Certificate-based user delegation with full audit trail.
6. **Capabilities**: Fine-grained, per-agent grants — no implicit permissions.
7. **Audit**: Intent log + activity log capture all operations server-side.

---

## Roadmap

### Phase 1 — Foundation ✅
- [x] Monorepo structure (pnpm + Turborepo)
- [x] Control plane UI (Next.js + React + Tailwind)
- [x] Agent registration & approval flow
- [x] VaultysId integration (passwordless QR auth)
- [x] SQLite persistence (full schema + migrations)
- [x] WebSocket server (agent heartbeats, intent dispatch)
- [x] Basic API routes for agents and policies

### Phase 2 — Security & Identity ✅
- [x] Peer grant verification (signed capability delegation)
- [x] Policy management (create, assign, expire)
- [x] Intent log (full audit trail)
- [x] Activity log
- [x] Certificate-based user delegation

### Phase 3 — Orchestration (In Progress)
- [x] Workflow engine (visual editor, execution, run history)
- [x] Human-in-the-loop approval steps + inbox
- [x] Task queue & scheduler in agent controller
- [x] Multi-agent peer tools (remote-agent tool calls)
- [x] Knowledge system (file ingestion, semantic search)
- [ ] Conditional branches
- [ ] Error handling & automatic retries

### Phase 4 — Integrations & Scale (In Progress)
- [x] LiteLLM model registry with realm-scoped virtual keys
- [x] Microsoft Entra ID (Azure AD) user/group sync
- [x] Token usage tracking & daily/monthly budgets
- [x] Governance posture dashboard
- [x] Realms (multi-tenant namespaces)
- [x] Docker Compose dev environment
- [x] Code quality & maintainability (shared utilities, reusable components, API types)
- [x] Comprehensive test coverage
- [ ] Clustering / multi-control-plane support
- [ ] Webhook support
- [ ] OpenTelemetry instrumentation

### Phase 5 — Documentation & Polish
- [ ] Complete API reference documentation
- [ ] Tutorial guides for common workflows
- [ ] Video tutorials
- [ ] Community examples & templates

---

## Contributing

Active development — contributions welcome. Priority areas:

**High Priority**
- Workflow conditional branches and error handling/retry logic
- API endpoint documentation completion
- Additional LLM provider integrations
- Security hardening & penetration testing

**Medium Priority**
- Performance optimizations (caching, query optimization)
- Additional skills and tool integrations
- Webhook support for external system integration
- OpenTelemetry instrumentation for observability

**Maintenance**
- Test coverage expansion
- Documentation updates
- Dependency updates and security patches
- Community feedback and examples

**Guidelines**
- Open an issue before starting significant work
- Follow existing code patterns (see REFACTORING_SUMMARY.md)
- Add tests for new functionality
- Update documentation and type definitions
- Target the `refactor2` or feature branch, not `main`

---

## License

[MIT](./LICENSE) © François-Xavier Thoorens

## Resources

- [VaultysId](https://github.com/vaultys/id) — decentralized identity framework
- [Next.js](https://nextjs.org/docs)
- [Turborepo](https://turbo.build/repo/docs)
- [LiteLLM](https://docs.litellm.ai/)
