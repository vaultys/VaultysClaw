# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

VaultysClaw is a decentralized AI agent orchestration platform. A central **control plane** (Next.js + WebSocket server) manages lightweight **agent controllers** that connect via WebSocket, execute LLM-driven intents using tools, and maintain cryptographic identity via [VaultysId](https://github.com/vaultys/id).

**Monorepo**: pnpm workspaces + Turborepo. Main packages:

| Package | Description | CLAUDE.md |
|---|---|---|
| `packages/shared` | Types, security utils, channel protocol definitions | [→](packages/shared/CLAUDE.md) |
| `packages/policy` | Policy engine: capability/resource-limit types, cert signing/verification, runtime enforcement gates | [→](packages/policy/CLAUDE.md) |
| `packages/control-plane` | Next.js App Router dashboard + WebSocket server (port 3000 / WS 8080) | [→](packages/control-plane/CLAUDE.md) |
| `packages/control-plane/app/api` | REST API routes (ts-rest pattern) | [→](packages/control-plane/app/api/CLAUDE.md) |
| `packages/agent-controller` | Agent runtime CLI, tools, skills, memory | [→](packages/agent-controller/CLAUDE.md) |
| `packages/mcp-gateway` | MCP server exposing VaultysClaw agents as tools | [→](packages/mcp-gateway/CLAUDE.md) |
| `packages/notifier` | Standalone worker: consumes notification events from BullMQ and delivers email / in-app / push (SSE) | [→](packages/notifier/CLAUDE.md) |

## Commands

```bash
# Development
pnpm install
pnpm dev                     # Start all packages (control plane + agent)
pnpm vaultysclaw:dev         # Control plane only (preferred alias)
pnpm agent:dev               # Agent controller only (headless)
pnpm agent:web               # Agent controller with web UI (port 3002)
pnpm agent:tui               # Agent controller with Ink TUI
pnpm mcp:dev                 # MCP gateway (stdio, reads VC_CONTROL_PLANE_URL + VC_API_KEY)
pnpm notifier:dev            # Notifier worker (reads DATABASE_URL + REDIS_URL; needs Redis running)
pnpm mcp:build               # Build MCP gateway to dist/

# Demo / Simulator
pnpm simulator:up            # Full demo stack: PostgreSQL + MinIO + Docling + LiteLLM + Grafana + 30 agents
pnpm simulator:seed          # Seed DB (8 workspaces, 200+ users, 30 agents, 15 workflows) — idempotent
pnpm simulator:start         # Connect 30 simulated agents (control plane must be running)
pnpm simulator:full          # seed + start
./demo/setup.sh              # Minimal demo: 3 real agents for recording / quick exploration

# Build
pnpm build                   # All packages via Turborepo
pnpm agent:build:binaries    # Build standalone agent CLI binaries

# Testing
pnpm test                    # Run all tests (Vitest, no watch)
pnpm test:ui                 # Vitest interactive UI
pnpm test:docker             # Docker integration tests
pnpm test:litellm            # LiteLLM integration tests
pnpm vitest run __tests__/channels.test.ts  # Single test file

# Code quality
pnpm lint
pnpm type-check
pnpm format
```

## Communication Protocol

Agents connect to the control plane via WebSocket on port 8080. All messages follow a typed envelope defined in `packages/shared/src/channel-types.ts`. Critical messages (policies, intents) carry ECDSA signatures verified against the sender's VaultysId public key.

**Agent lifecycle**:

1. Agent connects → sends `register` with its public key
2. Admin approves in UI → control plane sends `register_ack` + certificate
3. Control plane routes `intent` messages to agents
4. Agent executes via LLM + tools → sends `result` back
5. Policies distributed as `policy_update` messages; agents verify signatures before storing

## Notifications

Users choose, per event, how they are notified — **in-app** (bell + DB-backed), **email** (SMTP), and **push** (system notification via SSE while the app is open). Each event carries a **level** (`user` / `admin` / `owner`) — which controls who may *configure* it (a Member sees only `user` events, an Admin `user`+`admin`, an Owner all) — and an **audience** (`target` / `workspaceMembers` / `admins` / `owners`) — which controls who *receives* it. The two are decoupled: a workspace-scoped event is configurable by any user but delivered only to members of the affected workspace.

Pipeline (decoupled through a queue):

```
domain event → enqueueNotification()  → BullMQ queue "notifications" (Redis)
 (control-plane)                         → notifier service:
                                            resolve recipients (by audience) → read prefs
                                            → email (SMTP) / in-app (DB row) / push
                                            → Redis pub/sub  notif:user:<id>
                                                                   │
browser ── SSE /api/notifications/stream (subscribes Redis) ◄──────┘
   bell (in-app) + Notification API (push)
```

- **Event catalog is the single source of truth**: `packages/shared/src/notifications.ts` (`NOTIFICATION_EVENTS`, `NotificationLevel`, `LEVELS_FOR_ROLE`, `eventsForRole`, `userNotificationChannel`). Add an event there, then emit it with `enqueueNotification({ eventType, data })` (`packages/control-plane/lib/notification-queue.ts`) at the domain site, and (if needed) add a template in `packages/notifier/src/render.ts`.
- **Producer** is best-effort/fire-and-forget: if `REDIS_URL` is unset it silently no-ops and never breaks the request.
- **Notifier** is a separate worker package — see [packages/notifier/CLAUDE.md](packages/notifier/CLAUDE.md).
- **Settings UI is split by audience**: user settings live under `app/app/settings/*` (Profile, Security, Notifications, Appearance — reachable by any authenticated user); admin-only settings (API Keys, Integrations) stay under `app/admin/settings/*` (proxy-gated). Never put a user-facing page under `/admin/*`.
- Requires **Redis** (added to `docker/docker-compose.yml`).

## Environment Variables

| Variable | Package | Purpose |
|---|---|---|
| `DATABASE_URL` | control-plane, notifier | PostgreSQL connection string (Prisma) |
| `REDIS_URL` | control-plane, notifier | Redis URL for the BullMQ notification queue + pub/sub |
| `NEXTAUTH_URL` / `APP_URL` | control-plane, notifier | Browser-facing base URL; the notifier uses it to build deep-link buttons in emails (`APP_URL` overrides `NEXTAUTH_URL`) |
| `NOTIFICATION_RETENTION_DAYS` | control-plane | Days after which **read** notifications are pruned (default 30) |
| `PORT` / `WS_PORT` | control-plane | HTTP + WebSocket ports (default 3000/8080) |
| `NEXTAUTH_SECRET` | control-plane | NextAuth session secret |
| `LITELLM_BASE_URL` | control-plane | LiteLLM proxy URL |
| `AGENT_NAME` | agent-controller | Agent display name |
| `CONTROL_PLANE_URL` | agent-controller | Control plane base URL |
| `LLM_MODEL` / `LLM_API_KEY` | agent-controller | LLM provider config |
| `VAULTYS_ID_PATH` | agent-controller | Path to agent VaultysId identity file |

## Testing

Tests live in `__tests__/` at the repo root and use Vitest. They test integration paths (API routes, tool execution, workflow logic). Test files import from packages directly using the `@vaultysclaw/shared` path alias.

Multiple vitest configs for different test scopes:

- `vitest.config.mjs` — default (no Docker)
- `vitest.config.docker.mjs` — requires running Docker stack
- `vitest.config.litellm.mjs` — requires LiteLLM proxy (`docker-compose.litellm.yml`)
