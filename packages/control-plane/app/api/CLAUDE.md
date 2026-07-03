# app/api — REST API Routes

All **new** REST APIs follow the ts-rest + APIException pattern:

- **Single source of truth**: Zod schemas in contracts → type-safe on both client & server
- **Consistent error handling**: `APIException` thrown by helpers, caught by middleware
- **Zero drift**: client types inferred from the same contract the server validates against

## Admin / User / Public separation

Routes are split by **audience**, mirroring the UI split (`app/admin`, `app/app`, `app/(public)`). This is an **incremental migration** — only some domains have moved so far; the rest still sit at the top level until migrated.

| Audience | Route folder | Resulting path | Access |
|---|---|---|---|
| **Admin** | `app/api/admin/<domain>/` | `/api/admin/<domain>` | Admin/Owner (gating TODO — see below) |
| **Public** | `app/api/public/<domain>/` | `/api/public/<domain>` | Anyone, no auth |
| **User** | `app/api/(user)/<domain>/` | `/api/<domain>` | Any authenticated user |

The **user** folder is a Next.js route group `(user)` — the parentheses keep `user` **out of the path** (so `app/api/(user)/agents` serves `/api/agents`). Admin and public are **real path segments**.

**Contracts mirror the same split** under `lib/contracts/{admin,user,public}/<domain>/` (each still a 3-file folder: `.schemas.ts` / `.types.ts` / `.contract.ts`). Naming convention:

- Contracts: `adminAgentsContract`, `userAgentsContract`, `aboutContract` (public)
- Clients (`lib/api/ts-rest/client.ts`): `adminAgentsClient`, `userAgentsClient`, `aboutClient`
- Contract `path` strings must match the route folder (`/api/admin/...`, `/api/public/...`, `/api/...`)

### Audience grouping (`lib/contracts/index.ts`)

On top of the per-domain contracts, `index.ts` builds three **grouping routers** that mount every domain under its audience — `adminContract`, `userContract`, `publicContract` — and nests them into `appContract = { admin, user, public }`. This is **purely structural**: routes keep their absolute `path`, so nesting changes no URL. It exists so you can:

- Navigate the contract tree by audience: `adminContract.agents.search` (typed).
- Make calls grouped by audience via the objects in `lib/api/ts-rest/client.ts`: `adminApi` / `userApi` / `publicApi` bundle the per-domain clients — `unwrap(await adminApi.agents.search({ query }))`. (Plain objects of the existing singletons — no `initClient` over the merged contract, so TS inference stays fast.)

Domains not yet split into `admin`/`user`/`public` folders are still classified into one of the three groups by their primary audience (mixed domains follow their main consumer). When migrating or adding a domain, mount its contract under the right group in `index.ts` and add its client to the matching `*Api` object.

**Swagger tags follow the grouping**: `buildOpenApiSpec()` (`lib/api/openapi-spec.ts`) walks the two-level tree and emits one tag per `Audience / Domain` (e.g. `Admin / Agents`), so `/admin/docs` clusters operations by audience. `getApiRouteGroups()` (`lib/api/contract-routes.ts`) does the same for the API-key permission tree.

**Middleware state** (`lib/access-control.ts`): `/api/public` is in `publicPaths` (open to all). `/api/admin/*` is **not yet** gated to admins at the middleware level — it currently falls under the generic `/api/*` "any authenticated user" rule, and handlers keep their own `getAuthContext` / `canAdminAgent` checks. Admin gating will be enabled once the user-scoped API counterparts exist. When adding an admin route, still enforce admin rights inside the handler.

Currently migrated: `agents` → **admin** (`userAgentsContract` is an empty placeholder with a temporary `/api/agents` stub route), `about` → **public**.

## Contract Structure

Each domain has a `lib/contracts/[<audience>/]<domain>/` **folder** with three files (audience = `admin` / `user` / `public` for migrated domains; top-level for not-yet-migrated ones). Use `lib/contracts/admin/agents/` as the canonical reference.

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

```typescript
import { adminContract } from "@/lib/contracts";

const handlers = createNextRoute(adminContract.agents, {
  getAgent: async ({ params, request }) => {
    const auth = await getAuthContext(request); // throws APIException("UNAUTHORIZED")
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
