---
description: "Use when working on the control-plane package: Next.js App Router pages, API routes, database queries, React components, auth, or UI styling."
applyTo: "packages/control-plane/**"
---

# Control Plane Conventions

## API Routes

File structure: `app/api/<resource>/route.ts` (collection), `app/api/<resource>/[param]/route.ts` (item).

Every handler follows this order: auth check → permission check → DB query → response.

```typescript
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.canAccessWorkspace(workspaceId)) return forbidden();

  const db = getDb();
  // raw SQL via better-sqlite3 — no ORM
  return NextResponse.json({ success: true, data: result });
}
```

**Pagination** (use for all list endpoints):

```typescript
const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
const pageSize = Math.min(
  100,
  Math.max(1, parseInt(searchParams.get("pageSize") ?? "20") || 20)
);
// response shape:
return NextResponse.json({ items, total, page, pageSize, totalPages });
```

**Error responses**: `return NextResponse.json({ error: "Message" }, { status: 400 })`.
Wrap non-trivial handlers in `try/catch` and log with `console.error("POST /api/... error:", err)`.

Shared API response types live in `lib/api-types.ts` (`PaginationMeta`, `ListResponse<T>`, `AgentSummary`, etc.). Import from there before defining local types.

## Database

Access the SQLite singleton via `getDb()` from `@/lib/db`. Use raw prepared statements:

```typescript
const db = getDb();
const row = db.prepare("SELECT * FROM agents WHERE did = ?").get(did);
db.prepare("INSERT INTO agents (did, name) VALUES (?, ?)").run(did, name);
```

Schema changes go directly in `createTables()` in `lib/db.ts` — there are no migration files. Add `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements.

## Auth

Import from `@/lib/auth-utils`:

- `getAuthContext(request?)` — returns `AuthContext | null` (null = unauthenticated). **Always pass the `request` parameter** so API key authentication works in addition to session auth.
- `unauthorized()` / `forbidden()` — return typed `NextResponse` with 401/403
- Permission methods: `canAccessWorkspace`, `canAdminWorkspace`, `canAccessAgent`, `canAdminAgent`

Never use NextAuth middleware — call `getAuthContext(request)` at the top of each handler.

```typescript
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request); // ← pass request for API key support
  if (!auth) return unauthorized();
  // ...
}
```

## API Key Authentication

External clients can authenticate using an `X-API-Key` header or `Authorization: Bearer <key>` instead of a session cookie. The auth logic is centralized in `getAuthContext(request)`.

**Key format**: `vc_key_<32 base62 chars>`. Stored as SHA-256 hash only. Never log or expose raw keys.

**Public routes** (no auth required): `GET /api/public/health`, `GET /api/setup/status`, `GET /api/about`, all `/api/auth/**`. Detected automatically by `isPublicRoute()` in `lib/api-key-utils.ts`.

**Route scoping**: Each API key carries an `allowedRoutes` list of `"METHOD /api/path"` strings (e.g., `"GET /api/agents/[did]"`). The `matchRoute()` function converts `[param]` segments to regex for matching.

**Workspace scoping**: `workspaceId = null` → global key (same as admin session). `workspaceId` set → scoped key (only routes for that workspace).

**Managing keys**: Admin UI at `/server` → "API Keys" tab. Or programmatically via `POST /api/api-keys`.

## Route Registry

Every new route **must** be registered in `packages/control-plane/lib/route-registry.ts` (`ROUTE_REGISTRY` array). This drives:

- The permission tree in the "New API Key" modal
- The `pnpm tsx scripts/check-api-coverage.ts` coverage check

```typescript
{ path: "/api/my-resource", methods: ["GET", "POST"], group: "MyGroup", description: "..." }
```

## Swagger / OpenAPI Docs

The admin Swagger UI is at `/docs`. The spec is generated from `@openapi` JSDoc annotations on every route handler.

**Every handler needs a JSDoc block** (or the AI generator will add one):

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
 *         description: Success
 */
export async function GET(request: NextRequest) {
```

Scripts:

- `pnpm tsx scripts/check-api-coverage.ts` — find routes missing from registry
- `pnpm tsx scripts/generate-swagger-docs.ts [--check] [--force]` — generate missing `@openapi` JSDoc via AI (requires `OPENAI_API_KEY` in `.env`)
- `pnpm tsx scripts/update-route-auth-calls.ts [--dry-run]` — migrate `getAuthContext()` → `getAuthContext(request)` in bulk

## React Components

**Server vs client**: All pages use `"use client"`. Layouts are server components by default. Use `dynamic(() => import(...), { ssr: false })` for heavy client-side components (charts, graphs).

**Component organization**:

- `components/shared/` — reusable primitives (`Badge`, `Avatar`, `Modal`); import via barrel `components/shared/index.ts`
- `components/<feature>/` — feature-specific components (keep co-located)
- `hooks/` — custom hooks (`useAdminWS`, `useRole`, `useVaultysConnect`)

**Styling**:

- Tailwind only, using the adaptive palette tokens defined in `tailwind.config.js` and `app/theme.css`
- Colors: `background`, `foreground`, `primary`, `secondary`, `success`, `warning`, `danger`, `neutral` — each with steps 50–950 (e.g., `bg-background`, `text-foreground-500`, `border-neutral-200`, `bg-primary-100`)
- Steps auto-invert between light and dark: `bg-danger-50` = pale red in light, deep red in dark — write one class, both modes handled
- Common patterns: `bg-background` (page), `bg-background-100` (card), `bg-background-200` (raised), `text-foreground` (body), `text-foreground-500` (muted), `border-neutral-200` (dividers), `bg-primary` (CTA button)
- Never use `dark:` — dark mode is applied by `ThemeProvider` toggling a class on `<html>`
- Icons: `lucide-react` exclusively
- Charts: `recharts`; workflow diagrams: `ReactFlow`

**AppShell**: The root layout wraps pages in `<AppShell>` (Sidebar + TopBar). Standalone routes like `/login` and `/setup` skip the shell automatically.
