# app/api — REST API Routes

All **new** REST APIs follow the ts-rest + APIException pattern:
- **Single source of truth**: Zod schemas in contracts → type-safe on both client & server
- **Consistent error handling**: `APIException` thrown by helpers, caught by middleware
- **Zero drift**: client types inferred from the same contract the server validates against

## Contract Structure

Each domain has a `lib/contracts/<domain>/` **folder** with three files. Use `lib/contracts/agents/` as the canonical reference.

**`<domain>.schemas.ts`** — Zod schemas only (query, body, response). No `z.infer`, no router. Group with section comments:

```typescript
// ── Queries
export const ListAgentsQuerySchema = z.object({ realm: z.string().optional() });

// ── Bodies
export const UpdateAgentBodySchema = z.object({ capabilities: z.array(z.string()).optional() });

// ── Responses
export const AgentListResponseSchema = z.object({ agents: z.array(...) });
```

**`<domain>.types.ts`** — TypeScript types only: `z.infer<typeof XSchema>` + Prisma-derived types. Imports schemas from `./<domain>.schemas`:

```typescript
import { UpdateAgentBodySchema } from "./agents.schemas";
export type AgentInfo = Prisma.AgentGetPayload<{ /* ... */ }> & { online: boolean };
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

`app/api/<resource>/[param]/route.ts` — use `createNextRoute(contract, implementation)`:

```typescript
const handlers = createNextRoute(agentDetailContract, {
  getAgent: async ({ params, request }) => {
    const auth = await getAuthContext(request); // throws APIException("UNAUTHORIZED")
    const agent = await AgentDAO.findByDid(params.did);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");
    if (!(await auth.canAccessAgent(params.did))) throw new APIException("FORBIDDEN");
    return { status: 200, body: { /* typed against contract */ } };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
```

## Client

`lib/api/<domain>.ts` — use the contract client from `lib/api/ts-rest/client.ts`, call `unwrap()` to throw on non-2xx:

```typescript
async getOne(did: string): Promise<AgentDetail> {
  return unwrap(await agentContractClient.getAgent({ params: { did } }));
}
```

Import types from the contract in UI components: `import type { AgentDetail } from "@/lib/contracts"`.

## Error Handling

`APIException` (in `lib/api/utils/api-utils.ts`) maps code → HTTP status via `HttpCodes` enum:

```typescript
throw new APIException("UNAUTHORIZED"); // → 401
throw new APIException("FORBIDDEN");    // → 403
throw new APIException("NOT_FOUND", "Agent not found"); // → 404
```

Error body shape is always `{ error: string; code: string; }`, enforced by `resolveApiError()`.

## Key Files

- `lib/contracts/` — per-domain folders; `index.ts` aggregates all into `appContract`
- `lib/contracts/common.ts` — `commonErrorResponses` reused across contracts
- `lib/api/ts-rest/next-route.ts` — `createNextRoute` middleware
- `lib/api/ts-rest/client.ts` — `agentContractClient` + `unwrap`
- `lib/api/utils/api-utils.ts` — `APIException`, `resolveApiError`
- `lib/auth-utils.ts` — `getAuthContext` (throws `APIException("UNAUTHORIZED")`)
- `app/api/agents/[did]/route.ts` — canonical example (GET/PATCH/DELETE)

## Adding a New Domain

1. Create `lib/contracts/<domain>/` with the three files
2. Register in `lib/contracts/index.ts`
3. Create `app/api/<resource>/[param]/route.ts` using `createNextRoute()`
4. Add methods to `lib/api/<domain>.ts`
5. Import types from the contract in UI components

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
