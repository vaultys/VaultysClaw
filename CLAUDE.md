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
pnpm vaultysclaw:dev         # Control plane only (preferred alias)
pnpm agent:dev               # Agent controller only (headless)
pnpm agent:web               # Agent controller with web UI (port 3002)
pnpm agent:tui               # Agent controller with Ink TUI

# Demo / Simulator
pnpm simulator:up            # Full demo stack: PostgreSQL + MinIO + Docling + LiteLLM + Grafana + 30 agents
pnpm simulator:seed          # Seed DB (8 realms, 200+ users, 30 agents, 15 workflows) — idempotent
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

**Database**: SQLite at `.devdata/vaultysclaw.db` (dev) or PostgreSQL via Prisma (demo/production — see `packages/control-plane/prisma/`). Key tables: `agents`, `intents`, `intent_log`, `workflows`, `workflow_runs`, `realms`, `users`, `policies`, `capabilities`, `models`, `skills`, `channels`, `approvals`.

**Auth**: Passwordless QR-code login via VaultysId (no passwords). `next-auth` with a custom provider in `lib/auth-config.ts`.

### Agent Controller (`packages/agent-controller`)

- **`src/agent.ts`** — `AgentController` (EventEmitter): WebSocket client, auth challenge/response, task queue, scheduler, peer manager, memory store
- **`src/cli.ts`** — CLI entry point; modes: `headless` | `tui` (Ink terminal) | `web` (Vite SPA on port 3002)
- **`src/llm.ts`** — LLM invocation via Mastra (@mastra/core) + @ai-sdk/openai + ollama-ai-provider-v2; supports OpenAI, Anthropic, Google, Ollama
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

## API Design & Implementation (ts-rest Pattern)

All **new** control-plane REST APIs should follow the ts-rest + APIException pattern. This guarantees:
- **Single source of truth**: contracts in code (Zod schemas) → type-safe on both client & server
- **Consistent error handling**: `APIException` thrown by helpers like `getAuthContext()`, caught by middleware
- **Zero drift**: client types inferred from the same contract the server validates against

### Structure

**1. Contract** (`lib/contracts/<domain>.contract.ts`)
- Zod schemas for request/response bodies per status code
- ts-rest router with path params, query, method, responses
- Example: `lib/contracts/agents.contract.ts` — GET /api/agents/:did, PATCH capabilities, DELETE

```typescript
export const AgentDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  // ... all fields
});

export const agentDetailContract = c.router({
  getAgent: {
    method: "GET",
    path: "/api/agents/:did",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: AgentDetailSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema,
      404: ErrorSchema,
    },
  },
  // ... updateAgent, deleteAgent, etc.
});
```

**2. Route Handler** (`app/api/<resource>/[param]/route.ts`)
- Use `createNextRoute(contract, implementation)` to wrap all handlers
- Throw `APIException("CODE", message)` for errors; middleware handles conversion to HTTP status
- Return `{ status, body }` for success (type-checked against contract responses)
- Example: `app/api/agents/[did]/route.ts`

```typescript
const handlers = createNextRoute(agentDetailContract, {
  getAgent: async ({ params, request }) => {
    const auth = await getAuthContext(request); // Throws APIException("UNAUTHORIZED")
    const agent = await AgentDAO.findByDid(params.did);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");
    if (!(await auth.canAccessAgent(params.did))) throw new APIException("FORBIDDEN");
    
    return {
      status: 200,
      body: { /* fully typed against contract */ }
    };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
```

**3. Client** (`lib/api/<domain>.ts`)
- Use `agentContractClient` (from `lib/api/ts-rest/client.ts`) to call routes
- Call `unwrap()` to convert ts-rest's `{ status, body }` union to throwing on non-2xx
- Argument & return types flow from the contract → zero chance of drift

```typescript
async getOne(did: string): Promise<AgentDetail> {
  return unwrap(await agentContractClient.getAgent({ params: { did } }));
}
```

**4. Types** (UI components, etc.)
- Import from contract: `import type { AgentDetail } from "@/lib/contracts"`
- No duplicate interface definitions → contract is the source of truth

### Error Handling

**`APIException`** (in `lib/api/utils/api-utils.ts`)
- Thrown by helpers (`getAuthContext()`) and route handlers
- Maps code (e.g. `"UNAUTHORIZED"`) → HTTP status (e.g. `401`) via `HttpCodes` enum
- Both `withError` (legacy) and `createNextRoute` (new) catch & convert to canonical error body

```typescript
// In a helper
if (!auth) throw new APIException("UNAUTHORIZED");

// In a route handler
if (!hasPermission) throw new APIException("FORBIDDEN");
if (!found) throw new APIException("NOT_FOUND", "Agent not found");

// In createNextRoute middleware → 401/403/404 with { error, code }
```

### Files to Know

- **Contracts**: `lib/contracts/` (index.ts, contract.ts, common.ts, agents.contract.ts)
- **Middleware**: `lib/api/ts-rest/next-route.ts`, `lib/api/handlers/with-error.ts`
- **Client**: `lib/api/ts-rest/client.ts`
- **Errors**: `lib/api/utils/api-utils.ts` (APIException, resolveApiError)
- **Auth**: `lib/auth-utils.ts` (getAuthContext throws APIException)
- **Example route**: `app/api/agents/[did]/route.ts` — GET/PATCH/DELETE agents

### Extending to a New Domain

1. Create `lib/contracts/<domain>.contract.ts` with Zod schemas + router
2. Create `app/api/<resource>/[param]/route.ts` using `createNextRoute()`
3. Add methods to `lib/api/<domain>.ts` using `agentContractClient`
4. Import types from the contract in UI components
5. Tests: mock `getAuthContext` to throw `new APIException("UNAUTHORIZED")` for 401 cases

## Testing

Tests live in `__tests__/` at the repo root and use Vitest. They test integration paths (API routes, tool execution, workflow logic). Test files import from packages directly using the `@vaultysclaw/shared` path alias.

Multiple vitest configs for different test scopes:

- `vitest.config.mjs` — default (no Docker)
- `vitest.config.docker.mjs` — requires running Docker stack
- `vitest.config.litellm.mjs` — requires LiteLLM proxy (`docker-compose.litellm.yml`)

### Testing ts-rest Routes

Routes using `createNextRoute()` and `APIException` are tested by mocking `getAuthContext` to:
- **Return a valid context** for happy-path tests: `mockGetAuthContext.mockResolvedValue(makeAuthContext(...))`
- **Throw `APIException("UNAUTHORIZED")`** for 401 tests: `mockGetAuthContext.mockRejectedValue(new APIException("UNAUTHORIZED"))`
- **Return a context with missing permissions** for 403 tests: `mockGetAuthContext.mockResolvedValue({ did: "...", isGlobalAdmin: false, ... })`

Example from `__tests__/security.test.ts`:

```typescript
import { APIException } from "@/lib/api/utils/api-utils";
import { GET } from "@/app/api/agents/[did]/route";

function asUnauthenticated() {
  mockGetAuthContext.mockRejectedValue(new APIException("UNAUTHORIZED"));
}

it("returns 401 when unauthenticated", async () => {
  asUnauthenticated();
  const res = await GET(req("/api/agents/did123"), params({ did: "did123" }));
  expect(res._status).toBe(401);
  expect(res._body.code).toBe("UNAUTHORIZED");
});
```

The error body shape is always `{ error: string; code: string; }`, enforced by `resolveApiError()` in the middleware.

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
