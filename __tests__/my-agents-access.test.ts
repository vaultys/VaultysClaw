/**
 * Tests for the "My Agents" workspace scoping on GET /api/admin/agents.
 *
 * The `mine=true` query param forces the search to the caller's own workspaces
 * even for a global admin (who otherwise sees every agent). A Member is always
 * scoped to their workspaces, `mine` or not.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (must precede route import) ────────────────────────────────────────

vi.mock("@/lib/auth-utils", () => ({ getAuthContext: vi.fn() }));

vi.mock("@/lib/ws-server", () => ({
  getWSServer: vi.fn(() => ({
    getConnectedAgents: () => [],
    getAgent: () => undefined,
  })),
}));

vi.mock("@/db", () => ({
  AgentDAO: {
    query: vi.fn(async () => ({
      agents: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    })),
  },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { GET as agentsGET } from "../packages/control-plane/app/api/admin/agents/route";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { AgentDAO } from "../packages/control-plane/db";

const mockGetAuthContext = getAuthContext as unknown as ReturnType<typeof vi.fn>;
const mockQuery = AgentDAO.query as unknown as ReturnType<typeof vi.fn>;

const WS = new Set(["ws-1", "ws-2"]);

function authAs(isGlobalAdmin: boolean) {
  mockGetAuthContext.mockResolvedValue({
    did: "did:test",
    isOwner: false,
    isGlobalAdmin,
    workspaceIds: WS,
  });
}

async function callSearch(qs: string) {
  await agentsGET(new NextRequest(`http://localhost/api/admin/agents${qs}`));
  return mockQuery.mock.calls.at(-1)?.[0] as { workspaceIds?: Set<string> };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/agents — workspace scoping via `mine`", () => {
  it("global admin without `mine` sees ALL agents (no workspace filter)", async () => {
    authAs(true);
    const args = await callSearch("");
    expect(args.workspaceIds).toBeUndefined();
  });

  it("global admin with `mine=true` is scoped to their own workspaces", async () => {
    authAs(true);
    const args = await callSearch("?mine=true");
    expect(args.workspaceIds).toBe(WS);
  });

  it("member is always scoped to their workspaces (no `mine`)", async () => {
    authAs(false);
    const args = await callSearch("");
    expect(args.workspaceIds).toBe(WS);
  });

  it("member with `mine=true` is scoped to their workspaces", async () => {
    authAs(false);
    const args = await callSearch("?mine=true");
    expect(args.workspaceIds).toBe(WS);
  });
});
