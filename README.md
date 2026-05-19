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
│   ├── shared/                  # Shared types & security utilities
│   ├── control-plane/           # Next.js dashboard + WebSocket server
│   │   ├── app/                 # Next.js App Router pages & API routes
│   │   ├── components/          # React UI (layout, workflows, graphs, users)
│   │   └── lib/                 # DB, auth, DAOs, workflow executor, LiteLLM client
│   └── agent-controller/        # Agent runtime (Node.js / Bun)
│       ├── src/                 # Core agent, tools, skills, memory, scheduler
│       └── web-app/             # Vite React UI (chat, runs, overview)
├── docs-site/                   # Docusaurus documentation site
├── docker/                      # Dockerfiles
├── docker-compose.litellm.yml   # LiteLLM sidecar stack
├── turbo.json
└── package.json                 # pnpm workspaces root
```

### Control Plane
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

### Agent Controller
- Lightweight Node.js service; optional Bun runtime for SQLite shim
- Connects to the control plane via a persistent WebSocket
- **Web UI** (port 3002) — React/Vite app with Chat, Runs, and Overview panels
- **TUI** — Ink-based terminal dashboard
- **Skills** — plugin architecture; built-in: `calculator`, `json-api`, `web-scraper`
- **Tools** — `file-ops`, `http-request`, `shell`, `code-runner`, `remote-agent`
- **Memory** — persistent semantic store with retrieval and summarization
- **Scheduler** — cron-style task scheduling
- **Task queue** — concurrent intent execution with back-pressure
- **Peer grant verification** — verifies cryptographic capability grants from the control plane before acting
- **LLM support** — local models, OpenAI, Anthropic, or any OpenAI-compatible endpoint

### Security Layer
- VaultysId for non-transferable, decentralized identity (users and agents)
- Passwordless authentication via QR code + VaultysId mobile app
- Certificate-based delegation (`delegation_certs` table)
- Peer grants — signed capability delegation between agents
- Policy-based capability grants — signed by the control plane
- Intent log — full audit trail of every intent sent and result received
- Activity log — server-side audit of all admin operations

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

```bash
pnpm dev            # Start everything in watch mode
pnpm build          # Production build (all packages)
pnpm test           # Run test suite (Vitest)
pnpm type-check     # TypeScript checks
pnpm lint           # ESLint
pnpm format         # Prettier
```

To target a single package:
```bash
pnpm dev -F @vaultysclaw/control-plane
pnpm dev -F @vaultysclaw/agent-controller
```

Docker:
```bash
# Full stack with LiteLLM
docker compose -f docker-compose.litellm.yml up

# Test environment
docker compose -f docker-compose.test.yml up
```

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

### Phase 1 — Foundation
- [x] Monorepo structure (pnpm + Turborepo)
- [x] Control plane UI (Next.js + React + Tailwind)
- [x] Agent registration & approval flow
- [x] VaultysId integration (passwordless QR auth)
- [x] SQLite persistence (full schema + migrations)
- [x] WebSocket server (agent heartbeats, intent dispatch)
- [x] Basic API routes for agents and policies

### Phase 2 — Security & Identity
- [x] Peer grant verification (signed capability delegation)
- [x] Policy management (create, assign, expire)
- [x] Intent log (full audit trail)
- [x] Activity log
- [x] Certificate-based user delegation

### Phase 3 — Orchestration
- [x] Workflow engine (visual editor, execution, run history)
- [x] Human-in-the-loop approval steps + inbox
- [x] Task queue & scheduler in agent controller
- [x] Multi-agent peer tools (remote-agent tool calls)
- [ ] Conditional branches
- [ ] Error handling & automatic retries

### Phase 4 — Integrations & Scale
- [x] LiteLLM model registry with realm-scoped virtual keys
- [x] Microsoft Entra ID (Azure AD) user/group sync
- [x] Token usage tracking & daily/monthly budgets
- [x] Governance posture dashboard
- [x] Realms (multi-tenant namespaces)
- [x] Docker Compose dev environment
- [ ] Clustering / multi-control-plane support
- [ ] Webhook support
- [ ] OpenTelemetry instrumentation

---

## Contributing

Active development — contributions welcome. Priority areas:

- Workflow conditional branches & retry logic
- Additional skills/tool integrations
- Security hardening & audit
- Documentation & examples
- Performance & observability

Please open an issue before starting significant work.

---

## License

[MIT](./LICENSE) © François-Xavier Thoorens

## Resources

- [VaultysId](https://github.com/vaultys/id) — decentralized identity framework
- [Next.js](https://nextjs.org/docs)
- [Turborepo](https://turbo.build/repo/docs)
- [LiteLLM](https://docs.litellm.ai/)
