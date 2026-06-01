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
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.canAccessRealm(realmId)) return forbidden();

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

- `getAuthContext()` — returns `AuthContext | null` (null = unauthenticated)
- `unauthorized()` / `forbidden()` — return typed `NextResponse` with 401/403
- Permission methods: `canAccessRealm`, `canAdminRealm`, `canAccessAgent`, `canAdminAgent`

Never use NextAuth middleware — call `getAuthContext()` at the top of each handler.

## React Components

**Server vs client**: All pages use `"use client"`. Layouts are server components by default. Use `dynamic(() => import(...), { ssr: false })` for heavy client-side components (charts, graphs).

**Component organization**:

- `components/shared/` — reusable primitives (`Badge`, `Avatar`, `Modal`); import via barrel `components/shared/index.ts`
- `components/<feature>/` — feature-specific components (keep co-located)
- `hooks/` — custom hooks (`useAdminWS`, `useRole`, `useVaultysConnect`)

**Styling**:

- Tailwind only, using `vc-*` color tokens defined in `tailwind.config.js` (e.g., `vc-bg`, `vc-surface`, `vc-text`)
- Never use `dark:` — dark mode is applied by `ThemeProvider` toggling a class on `<html>`
- Icons: `lucide-react` exclusively
- Charts: `recharts`; workflow diagrams: `ReactFlow`

**AppShell**: The root layout wraps pages in `<AppShell>` (Sidebar + TopBar). Standalone routes like `/login` and `/setup` skip the shell automatically.
