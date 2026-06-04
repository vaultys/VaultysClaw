# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

VaultysClaw is a decentralized AI agent orchestration platform. A central **control plane** (Next.js + WebSocket server) manages lightweight **agent controllers** that connect via WebSocket, execute LLM-driven intents using tools, and maintain cryptographic identity via [VaultysId](https://github.com/vaultys/id).

**Monorepo**: pnpm workspaces + Turborepo. Three main packages:

- `packages/shared` — types, security utils, channel protocol definitions
- `packages/control-plane` — Next.js App Router dashboard + WebSocket server (port 3000 / WS 8080)
- `packages/agent-controller` — agent runtime CLI, tools, skills, memory

## Commands

```bash
# Development
pnpm install
pnpm dev                     # Start all packages (control plane + agent)
pnpm dev -F @vaultysclaw/control-plane
pnpm dev -F @vaultysclaw/agent-controller

# Build
pnpm build                   # All packages via Turborepo
pnpm agent:build:binaries    # Build standalone agent CLI binaries

# Testing
pnpm test                    # Run all tests (Vitest, no watch)
pnpm test:ui                 # Vitest interactive UI
pnpm test:docker             # Docker integration tests
pnpm test:litellm            # LiteLLM integration tests

# Single test file
pnpm vitest run __tests__/channels.test.ts

# Code quality
pnpm lint
pnpm type-check
pnpm format
```

## Architecture

### Communication Protocol

Agents connect to the control plane via WebSocket on port 8080. All messages follow a typed envelope defined in `packages/shared/src/channel-types.ts`. Critical messages (policies, intents) carry ECDSA signatures verified against the sender's VaultysId public key.

**Agent lifecycle**:

1. Agent connects → sends `register` with its public key
2. Admin approves in UI → control plane sends `register_ack` + certificate
3. Control plane routes `intent` messages to agents
4. Agent executes via LLM + tools → sends `result` back
5. Policies distributed as `policy_update` messages; agents verify signatures before storing

### Control Plane (`packages/control-plane`)

- **`server.ts`** — Entry point: initializes SQLite, starts HTTP (port 3000) + WS (port 8080) servers, launches workflow scheduler
- **`lib/db.ts`** — Singleton SQLite instance (WAL mode, foreign keys on); all table schemas defined here
- **`lib/ws-server.ts`** — WebSocket server handling agent connections, heartbeats, intent routing, admin WebSocket on `/ws/admin`
- **`lib/workflow-executor.ts`** — Sequential/parallel node execution, approval steps, variable interpolation
- **`lib/message-dispatcher.ts`** — Routes intents to connected agents
- **`app/api/`** — Next.js App Router REST handlers organized by domain (agents, workflows, governance, realms, users, models, skills, channels, etc.)

**Database**: SQLite at `.devdata/vaultysclaw.db`. Key tables: `agents`, `intents`, `intent_log`, `workflows`, `workflow_runs`, `realms`, `users`, `policies`, `capabilities`, `models`, `skills`, `channels`, `approvals`.

**Auth**: Passwordless QR-code login via VaultysId (no passwords). `next-auth` with a custom provider in `lib/auth-config.ts`.

### Agent Controller (`packages/agent-controller`)

- **`src/agent.ts`** — `AgentController` (EventEmitter): WebSocket client, auth challenge/response, task queue, scheduler, peer manager, memory store
- **`src/cli.ts`** — CLI entry point; modes: `headless` | `tui` (Ink terminal) | `web` (Vite SPA on port 3002)
- **`src/llm.ts`** — LLM invocation via Vercel AI SDK; supports OpenAI, Anthropic, Google, Ollama, OpenAI-compatible endpoints
- **`src/tools/`** — Built-in tools: file ops, shell, code runner, HTTP requests, remote-agent calls
- **`src/skills/`** — Plugin-based skill loading (npm packages or local dirs); enabled per-realm in UI
- **`src/memory/`** — Semantic memory: SQLite persistence, vector-based retrieval, LLM summarization

**Agent SQLite** (`agent.db`): delegation certs, peer grants, LLM config, token usage, chat sessions, task history.

### Shared (`packages/shared`)

Core domain types live in `src/types.ts`: `VaultysIdentity`, `AgentCapability` enum, `ResourceLimits`, `AgentPolicy`, `SignedIntent`, `ExecutionResult`. Import via path alias `@vaultysclaw/shared`.

## Key Patterns

**Adding an API route**: Create `packages/control-plane/app/api/<resource>/route.ts`, export `GET`/`POST`/etc. handlers, call `getDb()` for SQLite access.

**Client-side HTTP calls**: Use the typed API client classes in `packages/control-plane/lib/api/`. One class per domain group — import singletons from `@/lib/api`:

```typescript
import { agentsApi, workflowsApi } from "@/lib/api";
const { agents } = await agentsApi.list({ realm: realmId });
const run = await workflowsApi.execute(workflowId, payload);
```

All classes extend `BaseApi` (in `lib/api/base.ts`) which throws `ApiError` on non-2xx responses. When adding a new route, also add the corresponding method to the relevant class.

**Adding a tool**: Create `packages/agent-controller/src/tools/<name>.ts`, export a tool definition with Zod schema, register in `src/tools/index.ts`.

**Adding a skill**: Create a package under `packages/agent-controller/skills/<name>/`, export Zod schemas + handlers. Skills auto-discovered by `src/skills/loader.ts`.

**WebSocket messages**: Add new message types to `packages/shared/src/channel-types.ts`, handle in `lib/ws-server.ts` (control plane) and `src/agent.ts` (agent).

## Testing

Tests live in `__tests__/` at the repo root and use Vitest. They test integration paths (API routes, tool execution, workflow logic). Test files import from packages directly using the `@vaultysclaw/shared` path alias.

Multiple vitest configs for different test scopes:

- `vitest.config.mjs` — default (no Docker)
- `vitest.config.docker.mjs` — requires running Docker stack
- `vitest.config.litellm.mjs` — requires LiteLLM proxy (`docker-compose.litellm.yml`)

## Environment

Control plane reads from `.env` in `packages/control-plane/`. Agent reads from `.env` in `packages/agent-controller/` or environment variables. Key variables:

| Variable                    | Package          | Purpose                                    |
| --------------------------- | ---------------- | ------------------------------------------ |
| `PORT` / `WS_PORT`          | control-plane    | HTTP + WebSocket ports (default 3000/8080) |
| `VAULTYS_ID_PATH`           | both             | Path to VaultysId identity file            |
| `NEXTAUTH_SECRET`           | control-plane    | NextAuth session secret                    |
| `LITELLM_BASE_URL`          | control-plane    | LiteLLM proxy URL                          |
| `AGENT_NAME`                | agent-controller | Agent display name                         |
| `CONTROL_PLANE_URL`         | agent-controller | Control plane base URL                     |
| `LLM_MODEL` / `LLM_API_KEY` | agent-controller | LLM provider config                        |
