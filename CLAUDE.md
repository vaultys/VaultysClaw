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

## Environment Variables

| Variable | Package | Purpose |
|---|---|---|
| `DATABASE_URL` | control-plane | PostgreSQL connection string (Prisma) |
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
