# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

VaultysClaw is a decentralized AI agent orchestration platform. A central **control plane** (Next.js + WebSocket server) manages lightweight **agent controllers** that connect via WebSocket, execute LLM-driven intents using tools, and maintain cryptographic identity via [VaultysId](https://github.com/vaultys/id).

**Monorepo**: pnpm workspaces + Turborepo. Main packages:

| Package | Description | CLAUDE.md |
|---|---|---|
| `packages/shared` | Types, security utils, channel protocol definitions | [→](packages/shared/CLAUDE.md) |
| `packages/policy` | Policy engine: capability/resource-limit types, cert signing/verification, runtime enforcement gates | [→](packages/policy/CLAUDE.md) |
| `packages/sdk` | VaultysClaw SDK: VaultysId identity, control-plane connection (WS/WebRTC), policy engine execution — base for agent-controller, mcp-gateway, and custom integrations | [→](packages/sdk/CLAUDE.md) |
| `packages/control-plane` | Next.js App Router dashboard + WebSocket server (port 3000 / WS 8080) | [→](packages/control-plane/CLAUDE.md) |
| `packages/control-plane/app/api` | REST API routes (ts-rest pattern) | [→](packages/control-plane/app/api/CLAUDE.md) |
| `packages/agent-controller` | Agent runtime CLI, tools, skills, memory | [→](packages/agent-controller/CLAUDE.md) |
| `packages/mcp-gateway` | MCP server exposing VaultysClaw agents as tools | [→](packages/mcp-gateway/CLAUDE.md) |
| `packages/proxy` | Governance-gated reverse proxy — onboards like an agent, verifies/authorizes API traffic locally, no agent-controller install required | [→](packages/proxy/CLAUDE.md) |
| `packages/mcp-proxy` | Standalone MCP front-end for the proxy's governance pipeline (stdio/streamable HTTP) — own VaultysId, own onboarding, depends on `@vaultysclaw/proxy` | [→](packages/mcp-proxy/CLAUDE.md) |
| `packages/notifier` | Standalone worker: consumes notification events from BullMQ and delivers email / in-app / push (SSE) | [→](packages/notifier/CLAUDE.md) |
| `packages/webhook-dispatcher` | Standalone worker: consumes webhook events from BullMQ, signs them (HMAC) and POSTs to configured endpoints | [→](packages/webhook-dispatcher/CLAUDE.md) |

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
pnpm proxy:dev               # Proxy (reads VC_CONTROL_PLANE_URL + VC_VAULTYS_ID_PATH + PROXY_HTTP_PORT)
pnpm notifier:dev            # Notifier worker (reads DATABASE_URL + REDIS_URL; needs Redis running)
pnpm webhook:dev             # Webhook dispatcher worker (reads DATABASE_URL + REDIS_URL; needs Redis running)
pnpm mcp:build               # Build MCP gateway to dist/
pnpm proxy:build             # Build proxy to dist/

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

## Webhooks

Outgoing HTTP webhooks mirror the notification pipeline but deliver **signed HTTP POSTs** to admin-configured endpoints instead of notifying users. Same decoupling: a domain event is enqueued on a BullMQ queue and a standalone worker delivers it.

```
domain event → enqueueWebhook({ eventType, payload })  → BullMQ queue "webhooks" (Redis)
 (control-plane)                                          → webhook-dispatcher service:
                                                             load active Webhook subscriptions
                                                             → filter by subscribed eventType
                                                             → sign (HMAC-SHA256) + POST to each endpoint
```

- **Event catalog is the single source of truth**: `packages/shared/src/webhooks.ts` (`WEBHOOK_EVENTS`, `WebhookEventDef`, `WebhookJob`, `WEBHOOK_QUEUE_NAME`, `getWebhookEvent`). It is **independent** of the notification catalog (no level/audience/channels; some events like `user.login`/`user.logout` are webhook-only).
- **Emit an event**: `void enqueueWebhook({ eventType, payload })` (`packages/control-plane/lib/webhook-queue.ts`) at the domain site, alongside any existing `enqueueNotification`. Fire-and-forget; no-ops when `REDIS_URL` is unset.
- **Sanitized payloads**: build the payload with an explicit per-entity helper in `packages/control-plane/lib/webhook-payloads.ts` (`workspacePayload`, `agentPayload`, `modelPayload`, `userPayload`, `knowledgePayload`, `skillPayload`, `workflowPayload`) — only safe fields, never secrets. `enqueueWebhook` additionally runs `stripSensitive` (recursive key blacklist) as defence-in-depth.
- **Config storage**: `Webhook` model in Prisma (`webhooks` table: name, description, url, secret, events[], isActive). CRUD via admin ts-rest contract `adminContract.webhooks` (`app/api/admin/webhooks/*`, `db/webhook.dao.ts`). The signing secret is returned in clear **only** on create / regenerate.
- **Config UI**: the **Webhooks** tab under `app/admin/settings/integrations` (`components/integrations/webhooks-panel.tsx`), org-global.
- **Dispatcher** is a separate worker package — see [packages/webhook-dispatcher/CLAUDE.md](packages/webhook-dispatcher/CLAUDE.md). Signature header `X-VaultysClaw-Signature: sha256=<hmac(timestamp + "." + rawBody)>`.
- **Docs**: the admin webhook reference lives at `app/admin/webhooks/docs/page.tsx` (linked from the Webhooks tab). Its content — envelope, headers, signature verification, and the per-event example payloads — is generated by `lib/webhook-docs.ts`, which feeds sample objects through the real payload builders so examples never drift.
- Requires **Redis**.

### Adding or changing a webhook event — ALWAYS update the docs

The docs are only auto-generated from data you must keep current. Whenever you **add, remove, or change the payload of** a webhook event, do all of the following in the same change so the reference at `/admin/webhooks/docs` stays correct:

1. **Catalog** — add/edit the entry in `packages/shared/src/webhooks.ts` (`WEBHOOK_EVENTS`): `type`, `label`, `description`, `group`. This drives both the config UI and the docs event list.
2. **Emit** — add/adjust the `void enqueueWebhook({ eventType, payload })` call at the domain site.
3. **Payload builder** — if the payload shape changes, update the matching helper in `packages/control-plane/lib/webhook-payloads.ts` (keep it an explicit allow-list — never add a secret field).
4. **Docs example** — update `EXAMPLE_PAYLOADS` in `packages/control-plane/lib/webhook-docs.ts` for the event so the documented example matches what is actually sent (reuse the builder + a sample object; add a new sample object if it's a new entity). A new event with no entry falls back to `{}` in the docs — that is a bug, not acceptable.
5. **Verify** — run the docs builder to confirm every event has a non-empty, secret-free example (e.g. a quick `buildWebhookEventDocs()` check, as in the docs page). Confirm `pnpm type-check` is clean.

## Environment Variables

| Variable | Package | Purpose |
|---|---|---|
| `DATABASE_URL` | control-plane, notifier, webhook-dispatcher | PostgreSQL connection string (Prisma) |
| `REDIS_URL` | control-plane, notifier, webhook-dispatcher | Redis URL for the BullMQ notification + webhook queues + pub/sub |
| `WEBHOOK_TIMEOUT_MS` | webhook-dispatcher | Per-endpoint delivery timeout (default 10000) |
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
