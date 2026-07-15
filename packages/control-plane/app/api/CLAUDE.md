# app/api — REST API Routes

All **new** REST APIs follow the ts-rest + APIException pattern:

- **Single source of truth**: Zod schemas in contracts → type-safe on both client & server
- **Consistent error handling**: `APIException` thrown by helpers, caught by middleware
- **Zero drift**: client types inferred from the same contract the server validates against

## Admin / User / Public separation

Routes are split by **audience**, mirroring the UI split (`app/admin`, `app/app`, `app/(public)`). This is an **incremental migration** — only some domains have moved so far; the rest still sit at the top level until migrated.

| Audience | Route folder | Resulting path | Access |
|---|---|---|---|
| **Admin** | `app/api/admin/<domain>/` | `/api/admin/<domain>` | Admin/Owner — **enforced by the proxy** (see below) |
| **Public** | `app/api/public/<domain>/` | `/api/public/<domain>` | Anyone, no auth |
| **User** | `app/api/(user)/<domain>/` | `/api/<domain>` | Any authenticated user |

The **user** folder is a Next.js route group `(user)` — the parentheses keep `user` **out of the path** (so `app/api/(user)/agents` serves `/api/agents`). Admin and public are **real path segments**.

**Contracts are fully organized by audience** under `lib/contracts/{admin,user,public}/<domain>/` (each a 3-file folder: `.schemas.ts` / `.types.ts` / `.contract.ts` — some split folders omit `.schemas`/`.types` when a contract needs none). Every domain contract now lives under its audience directory; **route** folders/paths are still being migrated incrementally, so a contract under `lib/contracts/admin/<domain>/` may still serve a top-level `/api/<domain>` path until its route moves. Naming convention:

- Contracts: `adminAgentsContract`, `userAgentsContract`, `aboutContract` (public)
- Clients (`lib/api/ts-rest/client.ts`): `adminAgentsClient`, `userAgentsClient`, `aboutClient`
- Contract `path` strings must match the route folder (`/api/admin/...`, `/api/public/...`, `/api/...`)

### Audience grouping (`lib/contracts/index.ts`)

On top of the per-domain contracts, `index.ts` builds three **grouping routers** that mount every domain under its audience — `adminContract`, `userContract`, `publicContract` — and nests them into `appContract = { admin, user, public }`. This is **purely structural**: routes keep their absolute `path`, so nesting changes no URL. It exists so you can:

- Navigate the contract tree by audience: `adminContract.agents.search` (typed).
- Make calls grouped by audience via the objects in `lib/api/ts-rest/client.ts`: `adminApi` / `userApi` / `publicApi` bundle the per-domain clients — `unwrap(await adminApi.agents.search({ query }))`. (Plain objects of the existing singletons — no `initClient` over the merged contract, so TS inference stays fast.)

Every contract folder lives under its audience directory (`lib/contracts/admin|user|public/<domain>/`). When adding a domain, create its folder under the right audience, mount its contract under the matching group router in `index.ts`, and add its client to the matching `*Api` object.

**Swagger tags follow the grouping**: `buildOpenApiSpec()` (`lib/api/openapi-spec.ts`) walks the two-level tree and emits one tag per `Audience / Domain` (e.g. `Admin / Agents`), so `/admin/docs` clusters operations by audience. `getApiRouteGroups()` (`lib/api/contract-routes.ts`) does the same for the API-key permission tree.

**Middleware state** (`lib/access-control.ts` + `proxy.ts`): `/api/public` is in `publicPaths` (open to all). **`/api/admin/*` is gated to global Admin/Owner by the proxy** — a non-admin gets a 403 JSON (`{ error, code: "FORBIDDEN" }`), an anonymous user is redirected to `/login`. So admin route handlers must **not** re-check global-admin status (`if (!auth.isGlobalAdmin) …`) — that's redundant. Only call `getAuthContext` in an admin handler when you need token data (`auth.did`, `auth.userId`) or a **finer** restriction than "is an admin":

- **Owner-only** admin routes still check `isOwnerRole` in the handler (e.g. `users/[did]`, `users/[did]/admin`).
- **Workspace/agent-scoped** endpoints must live under the **user** API (`/api/…`, not `/api/admin/…`) so members reach them past the proxy gate; they self-enforce via `canAccessWorkspace` / `canAdminWorkspace` / `canOwnWorkspace` / `canAccessAgent`. Do not put a scoped route under `/api/admin/*`.

`/api/*` (user) routes are guaranteed-authenticated by the proxy, so a bare `await getAuthContext(request)` used only to force auth is unnecessary — call it only to read token data or run a scoped check. The gate itself is unit-tested in `__tests__/access-control.test.ts`; per-handler admin-rejection tests are therefore obsolete.

## Contract Structure

Each domain has a `lib/contracts/<audience>/<domain>/` **folder** (audience = `admin` / `user` / `public`) with three files. Use `lib/contracts/admin/agents/` as the canonical reference. A few split folders that need no schemas or types omit those files (e.g. `admin/stats/` has no `.schemas`, `public/setup/` is contract-only).

**`<domain>.schemas.ts`** — Zod schemas only (query, body, response). No `z.infer`, no router. Group with section comments:

```typescript
// ── Queries
export const ListAgentsQuerySchema = z.object({ workspace: z.string().optional() });

// ── Bodies
export const UpdateAgentBodySchema = z.object({ capabilities: z.array(z.string()).optional() });

// ── Responses
export const AgentListResponseSchema = z.object({ agents: z.array(...) });
```

**`<domain>.types.ts`** — TypeScript types only: `z.infer<typeof XSchema>` + Prisma-derived types. Imports schemas from `./<domain>.schemas`:

```typescript
import { UpdateAgentBodySchema } from "./agents.schemas";
export type AgentInfo = Prisma.AgentGetPayload<{
  /* ... */
}> & { online: boolean };
export type UpdateAgentBody = z.infer<typeof UpdateAgentBodySchema>;
```

**`<domain>.contract.ts`** — ts-rest `c.router({...})` only. Imports from the two files above. Use `c.type<MyType>()` for responses backed by a TS type:

```typescript
import { UpdateAgentBodySchema } from "./agents.schemas";
import { AgentInfo } from "./agents.types";

export const agentsContract = c.router({
  getAgent: {
    method: "GET",
    path: "/api/agents/:did",
    pathParams: z.object({ did: z.string() }),
    responses: { 200: c.type<AgentInfo>(), ...commonErrorResponses },
  },
});
```

Register in `lib/contracts/index.ts`: import the router, add three `export *` lines (contract / schemas / types), add to `appContract`.

## Route Handler

`app/api/<resource>/[param]/route.ts` — use `createNextRoute(contract, implementation)`. Reference the domain contract through its audience group (`adminContract.<domain>` / `userContract.<domain>` / `publicContract.<domain>`), not the standalone `<domain>Contract` export:

A **user** route enforces its own fine-grained (scoped) authorization; the proxy only guarantees the caller is authenticated:

```typescript
import { userContract } from "@/lib/contracts";

const handlers = createNextRoute(userContract.agents, {
  getAgent: async ({ params, request }) => {
    const auth = await getAuthContext(request); // needed here for the scoped check
    const agent = await AgentDAO.findByDid(params.did);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");
    if (!(await auth.canAccessAgent(params.did)))
      throw new APIException("FORBIDDEN");
    return {
      status: 200,
      body: {
        /* typed against contract */
      },
    };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
```

An **admin** route (`createNextRoute(adminContract.<domain>, …)`) needs **no** authorization boilerplate — the proxy already restricts `/api/admin/*` to global Admin/Owner. Only call `getAuthContext` if the handler reads token data (`auth.did`, `auth.userId`) or applies an owner-only check (`isOwnerRole`). Do not re-add an `if (!auth.isGlobalAdmin) throw …` guard.

**Database access goes through DAOs, never `prisma` directly.** Route handlers call DAO methods from `db/` (`AgentDAO`, `PolicyDAO`, `IntentDAO`, `ActivityLogDAO`, …) — the DAOs own all `prisma` queries. If a handler needs a query/filter a DAO doesn't expose yet, add a method (or extend an existing one) on the DAO rather than importing `prisma` into the route. This keeps query logic reusable and testable in one place.

## Client

Use the audience-grouped client (`adminApi` / `userApi` / `publicApi`) from `lib/api/ts-rest/client.ts`, addressing the domain as a property, and call `unwrap()` to throw on non-2xx:

```typescript
import { adminApi, unwrap } from "@/lib/api/ts-rest/client";

async getOne(did: string): Promise<AgentDetail> {
  return unwrap(await adminApi.agents.getAgent({ params: { did } }));
}
```

The standalone `<domain>Client` singletons still exist (they are what the `*Api` objects bundle) but consumers should go through the grouped accessor.

Import types from the contract in UI components: `import type { AgentDetail } from "@/lib/contracts"`.

**Streaming (SSE) endpoints are the exception.** Routes that return `text/event-stream` (e.g. `POST /api/agents/[did]/chat-sessions`) still declare a contract (body typed; response as `c.otherResponse({ contentType: "text/event-stream", ... })`) for request typing and docs, but they are consumed with a raw `fetch` + `ReadableStream` reader — the ts-rest client buffers the whole body and cannot stream incrementally, and `createNextRoute` serializes a single `{ status, body }` rather than a stream, so such routes stay on `withError`. Don't "migrate" a streaming endpoint to the ts-rest client.

## Error Handling

`APIException` (in `lib/api/utils/api-utils.ts`) maps code → HTTP status via `HttpCodes` enum:

```typescript
throw new APIException("UNAUTHORIZED"); // → 401
throw new APIException("FORBIDDEN"); // → 403
throw new APIException("NOT_FOUND", "Agent not found"); // → 404
```

Error body shape is always `{ error: string; code: string; }`, enforced by `resolveApiError()`.

## Key Files

- `lib/contracts/` — per-domain folders; `index.ts` aggregates all into `appContract`
- `lib/contracts/common.ts` — `commonErrorResponses` reused across contracts
- `lib/api/ts-rest/next-route.ts` — `createNextRoute` middleware
- `lib/api/ts-rest/client.ts` — grouped clients `adminApi` / `userApi` / `publicApi` (+ per-domain singletons) + `unwrap`
- `lib/api/utils/api-utils.ts` — `APIException`, `resolveApiError`
- `lib/auth-utils.ts` — `getAuthContext` (throws `APIException("UNAUTHORIZED")`)
- `app/api/admin/agents/[did]/route.ts` — canonical example (GET/PATCH/DELETE)

## Adding a New Domain

1. Pick the audience (`admin` / `user` / `public`) — see the separation section above.
2. Create `lib/contracts/<audience>/<domain>/` with the three files; export `<audience><Domain>Contract` and set each `path` under `/api/<audience>/…` (or `/api/…` for `user`).
3. Register in `lib/contracts/index.ts` (import, the three `export *` lines, and mount the contract under the matching group router — `adminContract` / `userContract` / `publicContract`, keyed by domain).
4. Create the route under the matching folder: `app/api/admin/<resource>/…`, `app/api/public/<resource>/…`, or `app/api/(user)/<resource>/…`, using `createNextRoute()`.
5. Add a client in `lib/api/ts-rest/client.ts` (`<audience><Domain>Client`) and add it to the matching `adminApi` / `userApi` / `publicApi` object.
6. Import types from the contract in UI components.

## Testing Routes

Mock `getAuthContext` to control auth state:

```typescript
import { APIException } from "@/lib/api/utils/api-utils";

// 401
mockGetAuthContext.mockRejectedValue(new APIException("UNAUTHORIZED"));

// 403
mockGetAuthContext.mockResolvedValue({ did: "...", isGlobalAdmin: false, ... });

// Happy path
mockGetAuthContext.mockResolvedValue(makeAuthContext(...));
```
