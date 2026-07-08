/**
 * Tests for agent-list workspace scoping across the admin and user endpoints.
 *
 * - GET /api/admin/agents (admin): global admins see EVERY agent (no workspace
 *   filter); non-admins are rejected with 403.
 * - GET /api/agents (user): always scoped to the caller's own workspaces,
 *   whatever their role.
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
import { GET as adminAgentsGET } from "../packages/control-plane/app/api/admin/agents/route";
import { GET as userAgentsGET } from "../packages/control-plane/app/api/(user)/agents/route";
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

function lastQueryArgs() {
  return mockQuery.mock.calls.at(-1)?.[0] as { workspaceIds?: Set<string> };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/agents — admin global view", () => {
  it("global admin sees ALL agents (no workspace filter)", async () => {
    authAs(true);
    await adminAgentsGET(
      new NextRequest("http://localhost/api/admin/agents")
    );
    expect(lastQueryArgs().workspaceIds).toBeUndefined();
  });
});

describe("GET /api/agents — user view", () => {
  it("member is scoped to their own workspaces", async () => {
    authAs(false);
    await userAgentsGET(new NextRequest("http://localhost/api/agents"));
    expect(lastQueryArgs().workspaceIds).toBe(WS);
  });

  it("global admin is also scoped to their own workspaces here", async () => {
    authAs(true);
    await userAgentsGET(new NextRequest("http://localhost/api/agents"));
    expect(lastQueryArgs().workspaceIds).toBe(WS);
  });
});
