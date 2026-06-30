import { appContract } from "@/lib/contracts";

/**
 * Derives the list of API routes straight from the ts-rest `appContract` —
 * the single source of truth for every endpoint. Replaces the hand-maintained
 * `route-registry.ts`.
 *
 * Used by the API-key permission selector (settings/integrations) to render the
 * route tree the admin grants a key access to. Paths are emitted in Next.js
 * `[param]` form so they match the format stored in `allowedRoutes` and checked
 * by `matchRoute` (see lib/api/utils/api-key-utils.ts).
 */

export interface ContractRoute {
  /** Next.js-style path, e.g. "/api/agents/[did]" */
  path: string;
  /** HTTP methods supported at this path */
  methods: string[];
  /** Short description taken from the contract `summary`, if any */
  description?: string;
}

export interface ContractRouteGroup {
  /** Human-friendly group label derived from the top-level contract key */
  group: string;
  routes: ContractRoute[];
}

type AppRouteLike = { method: string; path: string; summary?: string };

function isRoute(v: unknown): v is AppRouteLike {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { method?: unknown }).method === "string" &&
    typeof (v as { path?: unknown }).path === "string"
  );
}

/** Convert ts-rest `:param` segments to Next.js `[param]`. */
function toNextPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "[$1]");
}

/** camelCase / kebab-case contract key → Title Case label. */
function prettyGroup(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function collectRoutes(
  node: unknown,
  methodsByPath: Map<string, Set<string>>,
  summaryByPath: Map<string, string>
): void {
  if (!node || typeof node !== "object") return;
  if (isRoute(node)) {
    const path = toNextPath(node.path);
    if (!methodsByPath.has(path)) methodsByPath.set(path, new Set());
    methodsByPath.get(path)!.add(node.method.toUpperCase());
    if (node.summary && !summaryByPath.has(path))
      summaryByPath.set(path, node.summary);
    return;
  }
  // Plain (sub-)router: descend into each entry.
  for (const value of Object.values(node)) {
    collectRoutes(value, methodsByPath, summaryByPath);
  }
}

/**
 * Returns every contract route grouped by its top-level domain contract.
 * Computed once at module load — the contract is static.
 */
export function getApiRouteGroups(): ContractRouteGroup[] {
  const groups: ContractRouteGroup[] = [];

  for (const [key, router] of Object.entries(appContract)) {
    const methodsByPath = new Map<string, Set<string>>();
    const summaryByPath = new Map<string, string>();
    collectRoutes(router, methodsByPath, summaryByPath);
    if (methodsByPath.size === 0) continue;

    const routes: ContractRoute[] = Array.from(methodsByPath.entries())
      .map(([path, methods]) => ({
        path,
        methods: Array.from(methods).sort(),
        description: summaryByPath.get(path),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    groups.push({ group: prettyGroup(key), routes });
  }

  return groups.sort((a, b) => a.group.localeCompare(b.group));
}

export const API_ROUTE_GROUPS = getApiRouteGroups();
