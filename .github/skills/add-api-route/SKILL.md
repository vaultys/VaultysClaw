---
name: add-api-route
description: "Add a new REST API route to the control-plane. Use when creating a new resource endpoint, adding GET/POST/PUT/DELETE handlers, building paginated list APIs, or extending the REST API surface. Covers file creation, auth guard, DB queries, response shape, api-types.ts registration, and test scaffolding."
argument-hint: "<resource> [sub-resource] — e.g. 'invitations' or 'workspaces/members'"
---

# Add API Route — Control Plane

## When to Use

- Creating a new resource endpoint under `packages/control-plane/app/api/`
- Adding handlers to an existing route file
- Ensuring consistent auth, error handling, pagination, and response shapes

## Procedure

### 1. Determine Route Path & Handlers

From the argument (e.g. `invitations`):

- Collection: `app/api/invitations/route.ts` — `GET` (list) + `POST` (create)
- Item: `app/api/invitations/[id]/route.ts` — `GET` (detail) + `PUT`/`PATCH` (update) + `DELETE`

If sub-resource (e.g. `workspaces/members`): `app/api/workspaces/[id]/members/route.ts`.

### 2. Create the Route File

Use [./assets/route-template.ts](./assets/route-template.ts) as starting point. Key rules:

- Always call `getAuthContext(request)` first (pass `request` for API key auth); return `unauthorized()` if null
- Use `forbidden()` for permission failures (e.g. `!auth.isGlobalAdmin`, `!auth.canAccessWorkspace(id)`)
- Wrap all handlers in `try/catch`; log with `console.error("METHOD /api/<resource> error:", err)`
- For list endpoints, apply pagination — see template for the pattern
- Parse `[id]` from dynamic segments with `const { id } = await params`

### 3. Add DB Query Functions (if needed)

Add helper functions to `packages/control-plane/lib/db.ts`:

- Use `getDb()` singleton and raw `better-sqlite3` prepared statements
- Name convention: `getXxx(id)`, `listXxx(filters)`, `createXxx(data)`, `updateXxx(id, data)`, `deleteXxx(id)`
- Add indexes with `CREATE INDEX IF NOT EXISTS idx_<table>_<col>` inside `createTables()`

### 4. Register Response Types (if new resource)

Add to `packages/control-plane/lib/api-types.ts`:

- Summary type for list items (e.g. `InvitationSummary`)
- Full type for detail response if different from summary

### 5. Register in Route Registry

Add an entry to `packages/control-plane/lib/route-registry.ts` (`ROUTE_REGISTRY`):

```typescript
{ path: "/api/my-resource",     methods: ["GET", "POST"], group: "MyGroup", description: "List / create my resources" },
{ path: "/api/my-resource/[id]", methods: ["GET", "PUT", "DELETE"], group: "MyGroup", description: "Get / update / delete a my resource" },
```

This drives the API key permission tree in the admin UI and the `check-api-coverage.ts` script.

### 6. Add Swagger JSDoc

Annotate each handler with an `@openapi` JSDoc block:

```typescript
/**
 * @openapi
 * /api/my-resource:
 *   get:
 *     summary: List my resources
 *     tags: [MyGroup]
 *     security:
 *       - sessionCookie: []
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: OK
 */
export async function GET(request: NextRequest) {
```

Or let the AI generator add it: `pnpm tsx scripts/generate-swagger-docs.ts` (requires `OPENAI_API_KEY` in `packages/control-plane/.env`).

### 7. Scaffold the Test

Use [./assets/test-template.ts](./assets/test-template.ts). Key rules:

- Place in `__tests__/<resource>-routes.test.ts`
- Mock `getAuthContext` from `@/lib/auth-utils` with `vi.mock`
- Import handlers directly: `import { GET, POST } from "@/app/api/<resource>/route"`
- Provide one happy-path test and one unauthenticated test per handler

### 6. Checklist Before Done

- [ ] Auth guard with `getAuthContext(request)` at the top of every handler
- [ ] `try/catch` with console.error in every handler
- [ ] Paginated GET list returns `{ items, total, page, pageSize, totalPages }`
- [ ] POST returns 201 on creation (`{ status: 201 }`)
- [ ] No hardcoded strings for error messages — keep them descriptive
- [ ] Types added to `api-types.ts` if new resource
- [ ] Entry added to `lib/route-registry.ts` (`ROUTE_REGISTRY`)
- [ ] `@openapi` JSDoc annotation on each handler
- [ ] Test file created with at least auth coverage
