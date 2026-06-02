# VaultysClaw — Agent Instructions

Decentralized AI agent orchestration platform. Monorepo (pnpm workspaces + Turborepo) with three packages:

- `packages/shared` — core types, security utils, channel protocol
- `packages/control-plane` — Next.js App Router dashboard + WebSocket server (port 3000 / WS 8080)
- `packages/agent-controller` — agent runtime CLI, tools, skills, memory

See [CLAUDE.md](../CLAUDE.md) for the full architecture overview.

## Build & Test

```bash
pnpm install
pnpm build               # All packages (shared must build first — handled by Turborepo)
pnpm dev                 # All packages dev mode
pnpm vaultysclaw:dev     # Control plane only
pnpm dev -F @vaultysclaw/agent-controller

pnpm test                # Vitest, no watch (default config)
pnpm type-check
pnpm lint
```

Single test file: `pnpm vitest run __tests__/channels.test.ts`

See [docs/QUICK_START.md](../docs/QUICK_START.md) for setup and [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) for full dev workflow.

## Key Architecture Decisions

- **No ORM**: Raw SQL via `better-sqlite3`. Schema created on startup in `packages/control-plane/lib/db.ts` (`createTables()`). No migration files — schema changes go directly in `createTables()`.
- **Auth**: Passwordless (VaultysId ECDSA challenge-response) via NextAuth. Each route handler calls `getAuthContext()` from `@/lib/auth-utils` — no middleware file.
- **WebSocket protocol**: All messages are typed envelopes from `packages/shared/src/channel-types.ts`. Critical messages (policies, intents) carry ECDSA signatures verified before processing.
- **`@/*` alias**: Only works in `packages/control-plane` (Next.js). Agent-controller uses relative imports.
- **Skills are pre-compiled JS**: Skills discovered at runtime must be `.js`/`.mjs` files, not `.ts`.

## Adding Things

**API route** → `packages/control-plane/app/api/<resource>/route.ts`:

```typescript
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);   // ← always pass request (API key auth)
  if (!auth) return unauthorized();
  // query via getDb() — no ORM
  return NextResponse.json({ success: true, data: ... });
}
```

After creating a route:

1. **Register in route registry**: add an entry to `packages/control-plane/lib/route-registry.ts` (`ROUTE_REGISTRY`)
2. **Add Swagger JSDoc**: annotate each handler with `@openapi` (or run `pnpm tsx scripts/generate-swagger-docs.ts`)

**API Key** → managed in the "API Keys" tab at `/server`. Keys use `X-API-Key` header or `Authorization: Bearer`. Schema in `api_keys` table in `lib/db.ts`. Types in `lib/api-types.ts` (`ApiKey`, `ApiKeyCreateRequest`).

**Tool** → `packages/agent-controller/src/tools/<name>.ts`, export `AgentToolDefinition`, register in `src/tools/index.ts`.

**Skill** → `packages/agent-controller/skills/<name>/index.ts`, export `SkillDefinition`. Auto-discovered by `src/skills/loader.ts`.

**WebSocket message type** → add to `packages/shared/src/channel-types.ts` union, handle in `lib/ws-server.ts` (control plane) and `src/agent.ts` (agent).

## Scripts

- `pnpm tsx scripts/check-api-coverage.ts` — find routes in filesystem missing from `ROUTE_REGISTRY`
- `pnpm tsx scripts/generate-swagger-docs.ts [--check] [--force]` — AI-generate `@openapi` JSDoc (requires `OPENAI_API_KEY` in `packages/control-plane/.env`)
- `pnpm tsx scripts/update-route-auth-calls.ts [--dry-run]` — bulk-migrate `getAuthContext()` → `getAuthContext(request)`

## Testing Conventions

- Framework: Vitest. Tests in `__tests__/` (integration) and `packages/*/src/**/*.test.ts` (unit).
- Vitest configs: default (no Docker), `vitest.config.docker.mjs`, `vitest.config.litellm.mjs`, `vitest.config.ui.mjs` (jsdom for React components).
- Mock `getAuthContext()` from `@/lib/auth-utils` in every API route test. See `__tests__/test-utils.ts` for `waitFor`, `TestWebSocket`, and other helpers.
- Vitest aliases `next/server` to `__tests__/mocks/next-server.ts` — tests won't see real Next.js behavior.
- Always close WebSocket/HTTP servers in `afterAll()` — Vitest won't auto-clean.

## Common Pitfalls

- **Delete SQLite carefully**: WAL mode produces `.db-wal` + `.db-shm` sidecar files; delete all three together.
- **Never edit `dist/` or `.next/`** — generated output only.
- **Monorepo imports**: Use `@vaultysclaw/shared` for cross-package imports; never use relative paths across package boundaries.
- **Build order matters**: `shared` must be built before `control-plane` or `agent-controller`. `pnpm build` handles this via Turborepo `"dependsOn": ["^build"]`.
- **`getAuthContext()` is Next.js only**: It calls `getServerSession()` internally — mock it in tests outside Next.js route handlers.
