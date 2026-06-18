# packages/control-plane

Next.js App Router dashboard + WebSocket server. HTTP on port 3000, WebSocket on port 8080.

## Key Files

- **`server.ts`** — Entry point: starts HTTP + WS servers, runs Prisma migrations/seed, launches workflow scheduler
- **`lib/ws-server.ts`** — WebSocket server: agent connections, heartbeats, intent routing, admin WebSocket on `/ws/admin`
- **`lib/workflow-executor.ts`** — Sequential/parallel node execution, approval steps, variable interpolation
- **`lib/message-dispatcher.ts`** — Routes intents to connected agents
- **`app/api/`** — REST handlers — see [app/api/CLAUDE.md](app/api/CLAUDE.md)

## Database

PostgreSQL via Prisma (`prisma/`). All DAOs are in `db/` and use the Prisma client (`db/client.ts`).

Key tables: `agents`, `intent_log`, `workflows`, `workflow_runs`, `realms`, `users`, `policies`, `model_registry`, `org_skills`, `channels`, `settings`.

## Auth

Passwordless QR-code login via VaultysId (no passwords). `next-auth` with a custom provider in `lib/auth-config.ts`.

## Client-Side HTTP Calls

Use the typed API client classes in `lib/api/`. One class per domain group — import singletons from `@/lib/api`:

```typescript
import { agentsApi, workflowsApi } from "@/lib/api";
const { agents } = await agentsApi.list({ realm: realmId });
const run = await workflowsApi.execute(workflowId, payload);
```

All classes extend `BaseApi` (`lib/api/base.ts`) which throws `ApiError` on non-2xx. When adding a new route, also add the corresponding method to the relevant client class.

## Page Toolbar

Pages do **not** render their own page-level header. Configure the shared toolbar via the `useToolbar` hook from `@/components/layout/ToolbarContext`. The shell wraps everything in `ToolbarProvider` and renders `<Toolbar />` (`components/layout/Toolbar.tsx`).

```typescript
import { useToolbar } from "@/components/layout/ToolbarContext";

useToolbar(
  {
    title: "Agents",
    description: `${total} registered · ${online} online`,
    actions: [
      // Non-interactive status pill (tone: success | neutral | warning | danger)
      { kind: "badge", id: "live", label: "Live", tone: "success", icon: <Wifi className="w-3 h-3" /> },
      // Segmented view switcher
      {
        kind: "tabs",
        id: "view",
        value: viewMode,
        onChange: (v) => setViewMode(v as "list" | "map"),
        options: [
          { value: "list", label: "List", icon: <List className="w-3.5 h-3.5" /> },
          { value: "map", label: "Map", icon: <Map className="w-3.5 h-3.5" /> },
        ],
      },
      // Button (variant: "primary" | "default")
      { kind: "button", id: "create", label: "Create agent", variant: "primary", icon: <Plus className="w-3.5 h-3.5" />, onClick: () => router.push("/agents/create") },
    ],
  },
  [total, online, wsConnected, viewMode, router] // deps: everything the config closes over
);
```

The hook clears the toolbar on unmount. Pass a dependency list of every value the config reads.

The toolbar **center** region renders one of (in precedence order): a `steps` wizard indicator, the `search` bar, or nothing. For a multi-step flow:

```typescript
useToolbar(
  { title: "Create agent", steps: { current: STEP_INDEX[step], steps: STEPS } },
  [step] // STEPS = [{ id, label }, …]; current is the zero-based active index
);
```

To add a new action type, extend the `ToolbarAction` union in `ToolbarContext.tsx` and render it in `Toolbar.tsx`.

## TopBar Breadcrumbs

The `TopBar` renders breadcrumbs from `BreadcrumbContext`. Set them with `useBreadcrumbs` from `@/components/layout/BreadcrumbContext`. The last segment is the bold current page; earlier segments with `href` are links.

```typescript
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";

useBreadcrumbs(
  [{ label: "Agents", href: "/agents" }, { label: "New agent" }],
  []
);
```

## Advanced Search Bar

Add a `search` field to the toolbar config to render a centered search input with removable filter chips and an expandable filter panel (`components/layout/ToolbarSearch.tsx`). This replaces per-page search/filter bars — don't render your own.

```typescript
useToolbar(
  {
    title: "Agents",
    search: {
      value: search,
      onChange: (v) => { setSearch(v); setPage(1); },
      placeholder: "Search agents…",
      chips: selectedCapabilities.map((cap) => ({
        id: `cap-${cap}`,
        label: cap.replace(/_/g, " "),
        onRemove: () => toggleCapability(cap),
      })),
      filterGroups: [
        {
          id: "status",
          label: "Status",
          icon: <Filter className="w-3.5 h-3.5 text-primary-600" />,
          options: [
            { id: "online", label: "Online", active: onlineFilter === "true", onToggle: () => setOnlineFilter(onlineFilter === "true" ? "" : "true") },
          ],
          onClear: onlineFilter ? () => setOnlineFilter("") : undefined,
        },
      ],
    },
  },
  [search, onlineFilter, selectedCapabilities]
);
```

Each `filterGroups[].options[]` is `{ id, label, icon?, active, onToggle }`. Active options render a checkmark. Surface active filters as `chips` so users can remove them without opening the panel.

## Styling & Theming

Use only semantic class names like `bg-primary`, `text-primary-400`, `border-success-500/30`. **Never use `dark:` variants** — the theme system handles light/dark automatically via CSS variables.
