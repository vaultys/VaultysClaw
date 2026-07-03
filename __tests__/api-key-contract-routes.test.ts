/**
 * Unit tests for the contract-derived API route registry that powers the
 * API-key permission selector (settings/integrations → API Keys tab).
 *
 *   - getApiRouteGroups() — walks the ts-rest appContract and groups every
 *     endpoint by domain, emitting Next.js `[param]` paths.
 *
 * The critical invariant: the paths it emits must be in the exact format that
 * `matchRoute` (the API-key auth boundary) understands, so a route selected in
 * the UI actually authorises the corresponding request.
 */

import { describe, it, expect } from "vitest";
import {
  getApiRouteGroups,
  API_ROUTE_GROUPS,
} from "../packages/control-plane/lib/api/contract-routes";
import { matchRoute } from "../packages/control-plane/lib/api/utils/api-key-utils";

const groups = getApiRouteGroups();
const allRoutes = groups.flatMap((g) =>
  g.routes.map((r) => ({ group: g.group, ...r }))
);

// ---------------------------------------------------------------------------
// Shape & basic invariants
// ---------------------------------------------------------------------------

describe("getApiRouteGroups — shape", () => {
  it("returns a non-empty list of groups", () => {
    expect(groups.length).toBeGreaterThan(0);
  });

  it("every group has a label and at least one route", () => {
    for (const g of groups) {
      expect(typeof g.group).toBe("string");
      expect(g.group.length).toBeGreaterThan(0);
      expect(g.routes.length).toBeGreaterThan(0);
    }
  });

  it("every route has an absolute path and at least one method", () => {
    for (const r of allRoutes) {
      // Most routes live under /api/; a few (e.g. /.well-known/*) do not.
      expect(r.path.startsWith("/")).toBe(true);
      expect(r.methods.length).toBeGreaterThan(0);
    }
  });

  it("exposes a memoised API_ROUTE_GROUPS equal to a fresh call", () => {
    expect(API_ROUTE_GROUPS).toEqual(groups);
  });
});

// ---------------------------------------------------------------------------
// Ordering & de-duplication
// ---------------------------------------------------------------------------

describe("getApiRouteGroups — ordering & dedup", () => {
  it("groups are sorted alphabetically by label", () => {
    const labels = groups.map((g) => g.group);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it("routes within a group are sorted by path", () => {
    for (const g of groups) {
      const paths = g.routes.map((r) => r.path);
      expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
    }
  });

  it("methods are uppercase, sorted, and de-duplicated", () => {
    for (const r of allRoutes) {
      expect(r.methods).toEqual([...r.methods].sort());
      expect(new Set(r.methods).size).toBe(r.methods.length);
      for (const m of r.methods) expect(m).toBe(m.toUpperCase());
    }
  });

  it("merges methods sharing a path into a single entry", () => {
    for (const g of groups) {
      const paths = g.routes.map((r) => r.path);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Path format — Next.js [param], never ts-rest :param
// ---------------------------------------------------------------------------

describe("getApiRouteGroups — path format", () => {
  it("never emits ts-rest colon params", () => {
    for (const r of allRoutes) {
      expect(r.path).not.toMatch(/:[A-Za-z0-9_]+/);
    }
  });

  it("converts colon params to [param] form", () => {
    // /api/admin/agents/:did → /api/admin/agents/[did]
    const agentDetail = allRoutes.find(
      (r) => r.path === "/api/admin/agents/[did]"
    );
    expect(agentDetail).toBeDefined();
    expect(agentDetail!.methods).toEqual(
      expect.arrayContaining(["GET", "PATCH", "DELETE"])
    );
  });
});

// ---------------------------------------------------------------------------
// Known routes are present
// ---------------------------------------------------------------------------

describe("getApiRouteGroups — known routes", () => {
  const find = (path: string) => allRoutes.find((r) => r.path === path);

  it("includes the agents list route", () => {
    const r = find("/api/admin/agents");
    expect(r?.methods).toContain("GET");
    // Groups are now labelled "Audience / Domain".
    expect(r?.group).toBe("Admin / Agents");
  });

  it("includes the api-keys routes under a 'User / Api Keys' group", () => {
    const r = find("/api/api-keys");
    expect(r).toBeDefined();
    expect(r?.group).toBe("User / Api Keys");
    expect(r?.methods).toEqual(expect.arrayContaining(["GET", "POST"]));
  });

  it("derives a readable group label from audience + camelCase contract key", () => {
    expect(groups.map((g) => g.group)).toContain("User / Api Keys");
  });
});

// ---------------------------------------------------------------------------
// Security invariant: emitted paths are matchRoute-compatible
// ---------------------------------------------------------------------------

describe("getApiRouteGroups ↔ matchRoute compatibility", () => {
  /** Replace each [param] with a concrete segment to simulate a real request. */
  const concreteUrl = (path: string) =>
    path.replace(/\[[^\]]+\]/g, "sample-value");

  it("a concrete request for every emitted route is authorised by an allowedRoutes entry built from it", () => {
    for (const r of allRoutes) {
      for (const method of r.methods) {
        const entry = `${method} ${r.path}`;
        const url = concreteUrl(r.path);
        expect(matchRoute(method, url, [entry])).toBe(true);
      }
    }
  });

  it("an allowedRoutes entry does not authorise a method it was not granted", () => {
    const detail = allRoutes.find(
      (r) => r.path === "/api/admin/agents/[did]"
    )!;
    // Build a key granting only GET on the route.
    const entry = "GET /api/admin/agents/[did]";
    expect(matchRoute("GET", "/api/admin/agents/did:vaultys:abc", [entry])).toBe(
      true
    );
    expect(
      matchRoute("DELETE", "/api/admin/agents/did:vaultys:abc", [entry])
    ).toBe(false);
    // sanity: the contract really does expose more than GET here
    expect(detail.methods.length).toBeGreaterThan(1);
  });

  it("an allowedRoutes entry for one path does not authorise a sibling path", () => {
    expect(matchRoute("GET", "/api/workspaces", ["GET /api/agents"])).toBe(false);
  });
});
