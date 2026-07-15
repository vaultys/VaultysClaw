/**
 * Security tests — authorization rules for the control-plane API.
 *
 * Three layers:
 *   1. DB helpers    — isUserInWorkspace, isUserWorkspaceAdmin, setUserWorkspaceAdmin
 *   2. Auth context  — AuthContext methods per role (via makeAuthContext helper)
 *   3. Route handlers — 401 when unauthenticated, 403 when insufficient role
 *
 * Mocking strategy: we mock @/lib/auth-utils (what every route handler calls)
 * rather than next-auth. This avoids the next-auth CJS/ESM interop issue where
 * vi.mock("next-auth") doesn't intercept reliably when the package is installed
 * in the project's node_modules and calls Next.js headers() at runtime.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that transitively uses them
// ---------------------------------------------------------------------------

// Mock auth-utils: route handlers call getAuthContext() and the forbidden/unauthorized
// helpers. We replace them here so tests control what "logged-in user" looks like.
vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
  forbidden: () => ({
    _body: { error: "Forbidden" },
    _status: 403,
    async json() {
      return { error: "Forbidden" };
    },
  }),
  unauthorized: () => ({
    _body: { error: "Not authenticated" },
    _status: 401,
    async json() {
      return { error: "Not authenticated" };
    },
  }),
}));

// next/server is aliased to __tests__/mocks/next-server.ts in vitest.config.mjs

// Stub the WS server — route handlers call getWSServer() but we don't need it
vi.mock("@/lib/ws-server", () => ({ getWSServer: vi.fn(() => null) }));

// Stub workflow-executor to prevent file-system side-effects
vi.mock("@/lib/workflow-executor", () => ({ executeWorkflow: vi.fn() }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import type { WorkflowDefinition } from "../packages/control-plane/lib/workflow-types";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { APIException } from "../packages/control-plane/lib/api/utils/api-utils";
import { prisma } from "../packages/control-plane/db/client";
import { PolicyDAO } from "../packages/control-plane/db";

// Route handlers under test
import { GET as agentsGET } from "../packages/control-plane/app/api/admin/agents/route";
import { GET as userAgentsGET } from "../packages/control-plane/app/api/(user)/agents/route";
import { GET as userAgentDetailGET } from "../packages/control-plane/app/api/(user)/agents/[did]/route";
import {
  GET as agentDetailGET,
  PATCH as agentDetailPATCH,
} from "../packages/control-plane/app/api/admin/agents/[did]/route";
import {
  GET as workspacesGET,
} from "../packages/control-plane/app/api/(user)/workspaces/route";
import {
  POST as workspacesPOST,
} from "../packages/control-plane/app/api/admin/workspaces/route";
import {
  GET as workspaceDetailGET,
  PATCH as workspaceDetailPATCH,
  DELETE as workspaceDetailDELETE,
} from "../packages/control-plane/app/api/(user)/workspaces/[id]/route";
import {
  POST as workspaceAgentsPOST,
  DELETE as workspaceAgentsDELETE,
} from "../packages/control-plane/app/api/(user)/workspaces/[id]/agents/route";
import {
  POST as workspaceUsersPOST,
  PATCH as workspaceUsersPATCH,
  DELETE as workspaceUsersDELETE,
} from "../packages/control-plane/app/api/(user)/workspaces/[id]/users/route";
import { POST as workspaceOwnerPOST } from "../packages/control-plane/app/api/(user)/workspaces/[id]/owner/route";
import {
  GET as workflowsGET,
  POST as workflowsPOST,
} from "../packages/control-plane/app/api/(user)/workflows/route";
import {
  GET as workflowDetailGET,
  PATCH as workflowDetailPATCH,
  DELETE as workflowDetailDELETE,
} from "../packages/control-plane/app/api/(user)/workflows/[id]/route";
import { GET as registrationsGET } from "../packages/control-plane/app/api/admin/registrations/route";
import { POST as approveRegistrationPOST } from "../packages/control-plane/app/api/admin/registrations/[id]/approve/route";
import {
  GET as policiesGET,
  POST as policiesPOST,
} from "../packages/control-plane/app/api/admin/policies/route";
import {
  GET as policyDetailGET,
  DELETE as policyDetailDELETE,
} from "../packages/control-plane/app/api/admin/policies/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetAuthContext = getAuthContext as ReturnType<typeof vi.fn>;

/**
 * Build an AuthContext object that mirrors the real auth-utils logic but uses
 * Prisma directly — no session / next-auth dependency.
 */
function makeAuthContext(
  did: string,
  { isOwner = false, isAdmin = false } = {}
) {
  const isGlobalAdmin = isOwner || isAdmin;
  return {
    did,
    isOwner,
    isGlobalAdmin,
    workspaceIds: new Set<string>(),
    async canAccessWorkspace(workspaceId: string) {
      if (isGlobalAdmin) return true;
      const membership = await prisma.userWorkspace.findFirst({ where: { userId: did, workspaceId } });
      return membership !== null;
    },
    // Admin/owner powers come only from the workspace membership role —
    // global-admin status grants visibility, not workspace authority.
    async canAdminWorkspace(workspaceId: string) {
      const membership = await prisma.userWorkspace.findFirst({ where: { userId: did, workspaceId } });
      return membership?.role === "Admin" || membership?.role === "Owner";
    },
    async canOwnWorkspace(workspaceId: string) {
      const membership = await prisma.userWorkspace.findFirst({ where: { userId: did, workspaceId } });
      return membership?.role === "Owner";
    },
    async canAccessAgent(agentDid: string) {
      if (isGlobalAdmin) return true;
      const agentWorkspaces = await prisma.agentWorkspace.findMany({ where: { agentDid } });
      const agentWorkspaceIds = new Set(agentWorkspaces.map((r) => r.workspaceId));
      const userMemberships = await prisma.userWorkspace.findMany({ where: { userId: did } });
      return userMemberships.some((r) => agentWorkspaceIds.has(r.workspaceId));
    },
    async canAdminAgent(agentDid: string) {
      if (isGlobalAdmin) return true;
      const agentWorkspaces = await prisma.agentWorkspace.findMany({ where: { agentDid } });
      const agentWorkspaceIds = new Set(agentWorkspaces.map((r) => r.workspaceId));
      const userMemberships = await prisma.userWorkspace.findMany({ where: { userId: did } });
      return userMemberships.some((r) => agentWorkspaceIds.has(r.workspaceId) && (r.role === "Admin" || r.role === "Owner"));
    },
  };
}

function asUnauthenticated() {
  // getAuthContext now throws APIException("UNAUTHORIZED") instead of returning
  // null; both error handlers (withError / createNextRoute) map that to a 401.
  mockGetAuthContext.mockRejectedValue(new APIException("UNAUTHORIZED"));
}
function asOwner(did = DID.owner) {
  mockGetAuthContext.mockResolvedValue(
    makeAuthContext(did, { isOwner: true, isAdmin: true })
  );
}
function asAdmin(did = DID.admin) {
  mockGetAuthContext.mockResolvedValue(makeAuthContext(did, { isAdmin: true }));
}
function asMember(did = DID.member) {
  mockGetAuthContext.mockResolvedValue({
    did,
    isOwner: false,
    isGlobalAdmin: false,
    workspaceIds: new Set([testWorkspaceId]),
    canAccessWorkspace: async (workspaceId: string) => workspaceId === testWorkspaceId,
    canAdminWorkspace: async () => false,
    canOwnWorkspace: async () => false,
    canAccessAgent: async (agentDid: string) => agentDid === DID.agent,
    canAdminAgent: async () => false,
  });
}
function asStranger(did = DID.stranger) {
  mockGetAuthContext.mockResolvedValue({
    did,
    isOwner: false,
    isGlobalAdmin: false,
    workspaceIds: new Set<string>(),
    canAccessWorkspace: async () => false,
    canAdminWorkspace: async () => false,
    canOwnWorkspace: async () => false,
    canAccessAgent: async () => false,
    canAdminAgent: async () => false,
  });
}
function asWorkspaceAdmin(did = DID.workspaceAdmin) {
  mockGetAuthContext.mockResolvedValue({
    did,
    isOwner: false,
    isGlobalAdmin: false,
    workspaceIds: new Set([testWorkspaceId]),
    canAccessWorkspace: async (workspaceId: string) => workspaceId === testWorkspaceId,
    canAdminWorkspace: async (workspaceId: string) => workspaceId === testWorkspaceId,
    canOwnWorkspace: async () => false,
    canAccessAgent: async (agentDid: string) => agentDid === DID.agent,
    canAdminAgent: async (agentDid: string) => agentDid === DID.agent,
  });
}
// A workspace Owner who is NOT a global admin — uses the real DB-backed
// makeAuthContext so canOwnWorkspace/canAdminWorkspace reflect the membership row.
function asWorkspaceOwner(did = DID.workspaceOwner) {
  mockGetAuthContext.mockResolvedValue(makeAuthContext(did));
}

/** Minimal mock that satisfies NextRequest for route handlers */
class MockRequest {
  nextUrl: { searchParams: URLSearchParams };
  url: string;
  private _body: unknown;

  constructor(url = "http://localhost/api", body?: unknown) {
    this.url = url;
    this.nextUrl = { searchParams: new URL(url).searchParams };
    this._body = body ?? {};
  }

  async json() {
    return this._body;
  }
}

function req(url?: string, body?: unknown) {
  return new MockRequest(url, body) as unknown as Request;
}

function params(p: Record<string, string>) {
  return { params: Promise.resolve(p) };
}

function expectStatus(response: unknown, status: number) {
  expect((response as { _status: number })._status).toBe(status);
}

// ---------------------------------------------------------------------------
// Test Identifiers  (all contain the sentinel so afterAll can clean up)
// ---------------------------------------------------------------------------

const DID = {
  owner: "did:vaultys:owner-sec-001",
  admin: "did:vaultys:admin-sec-001",
  member: "did:vaultys:member-sec-001",
  workspaceAdmin: "did:vaultys:workspaceadmin-sec-001",
  workspaceOwner: "did:vaultys:workspaceowner-sec-001",
  stranger: "did:vaultys:stranger-sec-001",
  agent: "did:vaultys:agent-sec-001",
};

const SENTINEL = "sec-001"; // used to clean up test data
let testWorkspaceId: string;
let testWorkflowId: string;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Clean up any stale Prisma data
  await prisma.userWorkspace.deleteMany({ where: { userId: { contains: SENTINEL } } });
  await prisma.userWorkspace.deleteMany({ where: { workspaceId: { contains: SENTINEL } } });
  await prisma.agentWorkspace.deleteMany({ where: { agentDid: { contains: SENTINEL } } });
  await prisma.user.deleteMany({ where: { did: { contains: SENTINEL } } });
  await prisma.agent.deleteMany({ where: { did: { contains: SENTINEL } } });
  await prisma.workspace.deleteMany({ where: { slug: { contains: "test-sec-workspace" } } });
  await prisma.workspace.deleteMany({ where: { id: { contains: SENTINEL } } });

  // ── Prisma setup (control plane uses Prisma exclusively, no SQLite) ────────
  await prisma.user.createMany({
    data: [
      { id: DID.owner, did: DID.owner, role: "Owner" },
      { id: DID.admin, did: DID.admin, role: "Admin" },
      { id: DID.member, did: DID.member },
      { id: DID.workspaceAdmin, did: DID.workspaceAdmin },
      { id: DID.workspaceOwner, did: DID.workspaceOwner },
      { id: DID.stranger, did: DID.stranger },
    ],
    skipDuplicates: true,
  });

  // Create workspace via Prisma — use a unique slug to avoid constraint violations
  // when tests run in parallel workers against the same DB.
  const workspaceSlug = `test-sec-workspace-${SENTINEL}`;
  testWorkspaceId = `workspace-sec-001-${crypto.randomUUID()}`;
  await prisma.workspace.deleteMany({ where: { slug: workspaceSlug } });
  await prisma.workspace.create({
    data: {
      id: testWorkspaceId,
      name: "Security Test Workspace",
      slug: workspaceSlug,
      color: "#6366f1",
    },
  });

  // Add users to workspace via Prisma
  await prisma.userWorkspace.createMany({
    data: [
      { userId: DID.member, workspaceId: testWorkspaceId, role: "Member" },
      { userId: DID.workspaceAdmin, workspaceId: testWorkspaceId, role: "Admin" },
      { userId: DID.workspaceOwner, workspaceId: testWorkspaceId, role: "Owner" },
    ],
    skipDuplicates: true,
  });

  // Create agent via Prisma
  await prisma.agent.create({
    data: {
      did: DID.agent,
      name: "Security Test Agent",
      capabilities: [],
    },
  });

  // Add agent to workspace via Prisma
  await prisma.agentWorkspace.create({
    data: {
      agentDid: DID.agent,
      workspaceId: testWorkspaceId,
    },
  });

  // Create workflow via Prisma
  const def: WorkflowDefinition = { nodes: [], edges: [] };
  testWorkflowId = `workflow-sec-001-${crypto.randomUUID()}`;
  await prisma.workflow.create({
    data: {
      id: testWorkflowId,
      name: "Security Test Workflow",
      definition: def as any,
      workspaceId: testWorkspaceId,
    },
  });
});

afterAll(async () => {
  // Prisma cleanup (control plane uses Prisma exclusively)
  await prisma.policy.deleteMany({ where: { OR: [{ createdBy: { contains: SENTINEL } }, { agentDid: { contains: SENTINEL } }] } });
  await prisma.workflow.deleteMany({ where: { workspaceId: testWorkspaceId } });
  await prisma.userWorkspace.deleteMany({ where: { userId: { contains: SENTINEL } } });
  await prisma.userWorkspace.deleteMany({ where: { workspaceId: { contains: SENTINEL } } });
  await prisma.agentWorkspace.deleteMany({ where: { agentDid: { contains: SENTINEL } } });
  await prisma.user.deleteMany({ where: { did: { contains: SENTINEL } } });
  await prisma.agent.deleteMany({ where: { did: { contains: SENTINEL } } });
  await prisma.workspace.deleteMany({ where: { slug: { contains: "test-sec-workspace" } } });
  // Throwaway workspaces created by owner delete/transfer tests.
  await prisma.workspace.deleteMany({ where: { id: { contains: SENTINEL } } });
});

// Reset mock before each test so auth context doesn't leak between tests
beforeEach(() => {
  mockGetAuthContext.mockReset();
});

// ===========================================================================
// 1. DB HELPERS
// ===========================================================================

describe.skip("DB helper — workspace membership", () => {
  it("isUserInWorkspace returns true for a member", () => {
    expect(isUserInWorkspace(DID.member, testWorkspaceId)).toBe(true);
  });

  it("isUserInWorkspace returns false for a stranger", () => {
    expect(isUserInWorkspace(DID.stranger, testWorkspaceId)).toBe(false);
  });

  it("isUserWorkspaceAdmin returns true for workspace admin", () => {
    expect(isUserWorkspaceAdmin(DID.workspaceAdmin, testWorkspaceId)).toBe(true);
  });

  it("isUserWorkspaceAdmin returns false for a regular member", () => {
    expect(isUserWorkspaceAdmin(DID.member, testWorkspaceId)).toBe(false);
  });

  it("isUserWorkspaceAdmin returns false for a stranger", () => {
    expect(isUserWorkspaceAdmin(DID.stranger, testWorkspaceId)).toBe(false);
  });

  it("setUserWorkspaceAdmin promotes a member to workspace admin", () => {
    const db = getDb();
    const tmpDid = `did:vaultys:tmp-promote-${SENTINEL}`;
    UserDao.create(tmpDid, null, false);
    addUserToWorkspace(tmpDid, testWorkspaceId, false, false);

    expect(isUserWorkspaceAdmin(tmpDid, testWorkspaceId)).toBe(false);
    setUserWorkspaceAdmin(tmpDid, testWorkspaceId, true);
    expect(isUserWorkspaceAdmin(tmpDid, testWorkspaceId)).toBe(true);

    db.prepare("DELETE FROM user_workspaces WHERE user_id = ?").run(tmpDid);
    db.prepare("DELETE FROM users WHERE did = ?").run(tmpDid);
  });

  it("setUserWorkspaceAdmin returns false when user is not a member", () => {
    const changed = setUserWorkspaceAdmin(DID.stranger, testWorkspaceId, true);
    expect(changed).toBe(false);
    expect(isUserWorkspaceAdmin(DID.stranger, testWorkspaceId)).toBe(false);
  });

  it("addUserToWorkspace with isWorkspaceAdmin=true stores the flag", () => {
    const db = getDb();
    const tmpDid = `did:vaultys:tmp-adm-flag-${SENTINEL}`;
    UserDao.create(tmpDid, null, false);
    addUserToWorkspace(tmpDid, testWorkspaceId, false, true);

    expect(isUserWorkspaceAdmin(tmpDid, testWorkspaceId)).toBe(true);

    db.prepare("DELETE FROM user_workspaces WHERE user_id = ?").run(tmpDid);
    db.prepare("DELETE FROM users WHERE did = ?").run(tmpDid);
  });

  it("getUserWorkspaces includes is_workspace_admin field", () => {
    const workspaces = getUserWorkspaces(DID.workspaceAdmin);
    const entry = workspaces.find((r) => r.workspace_id === testWorkspaceId);
    expect(entry).toBeDefined();
    expect(entry!.is_workspace_admin).toBe(1);
  });
});

// ===========================================================================
// 2. AUTH CONTEXT — makeAuthContext per role
// (Tests the authorization logic using the DB directly, same logic as
//  getAuthContext in auth-utils.ts but without the session / next-auth layer)
// ===========================================================================

describe.skip("AuthContext — owner", () => {
  it("isGlobalAdmin is true", () => {
    const ctx = makeAuthContext(DID.owner, { isOwner: true, isAdmin: true });
    expect(ctx.isGlobalAdmin).toBe(true);
    expect(ctx.isOwner).toBe(true);
  });

  it("canAccessWorkspace any workspace", () => {
    const ctx = makeAuthContext(DID.owner, { isOwner: true, isAdmin: true });
    expect(ctx.canAccessWorkspace(testWorkspaceId)).toBe(true);
    expect(ctx.canAccessWorkspace("non-existent-workspace-id")).toBe(true);
  });

  it("canAdminWorkspace any workspace", () => {
    const ctx = makeAuthContext(DID.owner, { isOwner: true, isAdmin: true });
    expect(ctx.canAdminWorkspace(testWorkspaceId)).toBe(true);
  });

  it("canAccessAgent any agent", () => {
    const ctx = makeAuthContext(DID.owner, { isOwner: true, isAdmin: true });
    expect(ctx.canAccessAgent(DID.agent)).toBe(true);
  });

  it("canAdminAgent any agent", () => {
    const ctx = makeAuthContext(DID.owner, { isOwner: true, isAdmin: true });
    expect(ctx.canAdminAgent(DID.agent)).toBe(true);
  });
});

describe("AuthContext — global admin", () => {
  it("isGlobalAdmin is true, isOwner is false", () => {
    const ctx = makeAuthContext(DID.admin, { isAdmin: true });
    expect(ctx.isGlobalAdmin).toBe(true);
    expect(ctx.isOwner).toBe(false);
  });

  it("canAccessWorkspace any workspace", async () => {
    const ctx = makeAuthContext(DID.admin, { isAdmin: true });
    expect(await ctx.canAccessWorkspace(testWorkspaceId)).toBe(true);
  });

  it("cannot admin a workspace it is not a member of", async () => {
    // Global-admin status grants visibility, not workspace-management power.
    const ctx = makeAuthContext(DID.admin, { isAdmin: true });
    expect(await ctx.canAdminWorkspace(testWorkspaceId)).toBe(false);
    expect(await ctx.canOwnWorkspace(testWorkspaceId)).toBe(false);
  });

  it("canAccessAgent any agent", async () => {
    const ctx = makeAuthContext(DID.admin, { isAdmin: true });
    expect(await ctx.canAccessAgent(DID.agent)).toBe(true);
  });

  it("canAdminAgent any agent", async () => {
    const ctx = makeAuthContext(DID.admin, { isAdmin: true });
    expect(await ctx.canAdminAgent(DID.agent)).toBe(true);
  });
});

describe.skip("AuthContext — regular member", () => {
  it("isGlobalAdmin is false", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.isGlobalAdmin).toBe(false);
    expect(ctx.isOwner).toBe(false);
  });

  it("canAccessWorkspace own workspace", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAccessWorkspace(testWorkspaceId)).toBe(true);
  });

  it("canAccessWorkspace returns false for a workspace they're not in", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAccessWorkspace("workspace-does-not-exist")).toBe(false);
  });

  it("canAdminWorkspace returns false (not a workspace admin)", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAdminWorkspace(testWorkspaceId)).toBe(false);
  });

  it("canAccessAgent for an agent in their workspace", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAccessAgent(DID.agent)).toBe(true);
  });

  it("canAccessAgent returns false for an agent not in any shared workspace", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAccessAgent("did:vaultys:unknown-agent")).toBe(false);
  });

  it("canAdminAgent returns false (not a workspace admin)", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAdminAgent(DID.agent)).toBe(false);
  });
});

describe.skip("AuthContext — workspace admin", () => {
  it("canAdminWorkspace returns true for their workspace", () => {
    const ctx = makeAuthContext(DID.workspaceAdmin);
    expect(ctx.canAdminWorkspace(testWorkspaceId)).toBe(true);
  });

  it("canAdminAgent returns true for agent in their workspace", () => {
    const ctx = makeAuthContext(DID.workspaceAdmin);
    expect(ctx.canAdminAgent(DID.agent)).toBe(true);
  });

  it("canAdminWorkspace returns false for a workspace they don't admin", () => {
    const ctx = makeAuthContext(DID.workspaceAdmin);
    expect(ctx.canAdminWorkspace("some-other-workspace-id")).toBe(false);
  });
});

describe("AuthContext — stranger (authenticated, no workspace membership)", () => {
  it("canAccessWorkspace returns false", async () => {
    const ctx = makeAuthContext(DID.stranger);
    expect(await ctx.canAccessWorkspace(testWorkspaceId)).toBe(false);
  });

  it("canAdminWorkspace returns false", async () => {
    const ctx = makeAuthContext(DID.stranger);
    expect(await ctx.canAdminWorkspace(testWorkspaceId)).toBe(false);
  });

  it("canAccessAgent returns false", async () => {
    const ctx = makeAuthContext(DID.stranger);
    expect(await ctx.canAccessAgent(DID.agent)).toBe(false);
  });
});

// ===========================================================================
// 3. ROUTE HANDLER AUTHORIZATION
// ===========================================================================

function status(res: unknown): number {
  return (res as { _status: number })._status;
}

// --- /api/admin/agents (admin global view) ----------------------------------

describe("GET /api/admin/agents", () => {
  it("succeeds (200) for a global admin", async () => {
    asAdmin();
    const res = await agentsGET(req() as never, {});
    expectStatus(res, 200);
  });
});

// --- /api/agents (user, workspace-scoped view) ------------------------------

describe("GET /api/agents", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await userAgentsGET(req() as never, {});
    expectStatus(res, 401);
  });

  it("succeeds (200) for a member — returns only workspace-scoped agents", async () => {
    asMember();
    const res = await userAgentsGET(req() as never, {});
    expectStatus(res, 200);
    const body = (res as { _body: { items: unknown[] } })._body;
    const agentDids = (body.items as { did: string }[]).map((a) => a.did);
    expect(agentDids).toContain(DID.agent);
    expect(agentDids).not.toContain("did:vaultys:some-other-agent");
  });
});

// --- /api/admin/agents/[did] (admin-only detail) ----------------------------

describe("GET /api/admin/agents/[did]", () => {
  it("returns 200 for a global admin", async () => {
    asAdmin();
    const res = await agentDetailGET(
      req() as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 200);
  });
});

// --- /api/agents/[did] (user detail, access-scoped) -------------------------

describe("GET /api/agents/[did]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await userAgentDetailGET(
      req() as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 401);
  });

  it("returns 200 for a member of the agent's workspace", async () => {
    asMember();
    const res = await userAgentDetailGET(
      req() as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 200);
  });

  it("returns 403 for a stranger (not in any shared workspace with the agent)", async () => {
    asStranger();
    const res = await userAgentDetailGET(
      req() as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 403);
  });

  it("returns 200 for a global admin (can access any agent)", async () => {
    asAdmin();
    const res = await userAgentDetailGET(
      req() as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 200);
  });
});

describe("PATCH /api/agents/[did] — capabilities", () => {
  it("is accessible to global admin (not 401/403)", async () => {
    asAdmin();
    const res = await agentDetailPATCH(
      req("http://localhost", { capabilities: ["file_access"] }) as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

// --- /api/workspaces ------------------------------------------------------------

describe("GET /api/workspaces", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workspacesGET(req("http://localhost/api/workspaces") as never);
    expectStatus(res, 401);
  });

  it("succeeds for a global admin", async () => {
    asAdmin();
    const res = await workspacesGET(req("http://localhost/api/workspaces") as never);
    expectStatus(res, 200);
  });

  it("succeeds for a member — returns only their workspaces", async () => {
    asMember();
    const res = await workspacesGET(req("http://localhost/api/workspaces") as never);
    expectStatus(res, 200);
    const body = (res as { _body: { workspaces: { id: string }[] } })._body;
    const ids = body.workspaces.map((r) => r.id);
    expect(ids).toContain(testWorkspaceId);
  });

  it("returns empty list for a stranger (no workspaces)", async () => {
    asStranger();
    const res = await workspacesGET(req("http://localhost/api/workspaces") as never);
    expectStatus(res, 200);
    const body = (res as { _body: { workspaces: unknown[] } })._body;
    expect(body.workspaces).toHaveLength(0);
  });
});

describe("POST /api/workspaces", () => {
  it("is accessible to a global admin", async () => {
    asAdmin();
    const res = await workspacesPOST(
      req("http://localhost", {
        name: "Temp Workspace",
        slug: `tmp-workspace-${Date.now()}`,
      }) as never
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    const body = (res as { _body: { workspace?: { id: string } } })._body;
    if (body.workspace?.id) {
      await prisma.workspace.deleteMany({ where: { id: body.workspace.id } });
    }
  });
});

// --- /api/workspaces/[id] -------------------------------------------------------

describe("GET /api/workspaces/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workspaceDetailGET(
      req() as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 401);
  });

  it("returns 200 for a member of the workspace", async () => {
    asMember();
    const res = await workspaceDetailGET(
      req() as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 200);
  });

  it("returns 403 for a stranger", async () => {
    asStranger();
    const res = await workspaceDetailGET(
      req() as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });
});

describe("PATCH /api/workspaces/[id] — workspace metadata", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workspaceDetailPATCH(
      req("http://localhost", { name: "New Name" }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workspaceDetailPATCH(
      req("http://localhost", { name: "New Name" }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a workspace admin (editing the realm is owner-only)", async () => {
    asWorkspaceAdmin();
    const res = await workspaceDetailPATCH(
      req("http://localhost", { name: "New Name" }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a global admin who is not the workspace owner", async () => {
    asAdmin();
    const res = await workspaceDetailPATCH(
      req("http://localhost", { name: "New Name" }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });

  it("is accessible to the workspace owner", async () => {
    asWorkspaceOwner();
    const res = await workspaceDetailPATCH(
      req("http://localhost", { name: "Security Test Workspace" }) as never,
      params({ id: testWorkspaceId })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

describe("DELETE /api/workspaces/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workspaceDetailDELETE(
      req() as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a workspace admin", async () => {
    asWorkspaceAdmin();
    const res = await workspaceDetailDELETE(
      req() as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workspaceDetailDELETE(
      req() as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });

  it("is accessible to the workspace owner", async () => {
    // Use a throwaway workspace so we don't delete the shared fixture.
    const wsId = `workspace-del-${SENTINEL}-${crypto.randomUUID()}`;
    await prisma.workspace.create({
      data: { id: wsId, name: "Del WS", slug: `del-${wsId}`, color: "#6366f1" },
    });
    await prisma.userWorkspace.create({
      data: { userId: DID.workspaceOwner, workspaceId: wsId, role: "Owner" },
    });
    asWorkspaceOwner();
    const res = await workspaceDetailDELETE(req() as never, params({ id: wsId }));
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

describe("POST /api/workspaces/[id]/owner — transfer ownership", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workspaceOwnerPOST(
      req("http://localhost", { userDid: DID.member }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workspaceOwnerPOST(
      req("http://localhost", { userDid: DID.member }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a workspace admin (owner-only action)", async () => {
    asWorkspaceAdmin();
    const res = await workspaceOwnerPOST(
      req("http://localhost", { userDid: DID.member }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });

  it("is accessible to the workspace owner", async () => {
    // Throwaway workspace with an owner + a member to receive ownership.
    const wsId = `workspace-xfer-${SENTINEL}-${crypto.randomUUID()}`;
    await prisma.workspace.create({
      data: { id: wsId, name: "Xfer WS", slug: `xfer-${wsId}`, color: "#6366f1" },
    });
    await prisma.userWorkspace.createMany({
      data: [
        { userId: DID.workspaceOwner, workspaceId: wsId, role: "Owner" },
        { userId: DID.member, workspaceId: wsId, role: "Member" },
      ],
    });
    asWorkspaceOwner();
    const res = await workspaceOwnerPOST(
      req("http://localhost", { userDid: DID.member }) as never,
      params({ id: wsId })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    // The member is now Owner and the previous owner was demoted to Admin.
    const rows = await prisma.userWorkspace.findMany({ where: { workspaceId: wsId } });
    expect(rows.find((r) => r.userId === DID.member)?.role).toBe("Owner");
    expect(rows.find((r) => r.userId === DID.workspaceOwner)?.role).toBe("Admin");
  });
});

describe("workspace admin can manage users but not the owner", () => {
  it("a workspace admin cannot remove the owner", async () => {
    asWorkspaceAdmin();
    const res = await workspaceUsersDELETE(
      req("http://localhost", { userDid: DID.workspaceOwner }) as never,
      params({ id: testWorkspaceId })
    );
    // Owner removal is rejected as a malformed request (not the default-workspace path).
    expect(status(res)).not.toBe(200);
  });

  it("a workspace admin cannot change the owner's role", async () => {
    asWorkspaceAdmin();
    const res = await workspaceUsersPATCH(
      req("http://localhost", { userDid: DID.workspaceOwner, role: "Member" }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });
});

describe("a workspace admin cannot strip their own rights", () => {
  it("cannot demote themselves via updateUser", async () => {
    asWorkspaceAdmin();
    const res = await workspaceUsersPATCH(
      req("http://localhost", { userDid: DID.workspaceAdmin, role: "Member" }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
    // Role unchanged in the DB.
    const row = await prisma.userWorkspace.findUnique({
      where: {
        userId_workspaceId: {
          userId: DID.workspaceAdmin,
          workspaceId: testWorkspaceId,
        },
      },
    });
    expect(row?.role).toBe("Admin");
  });

  it("cannot remove themselves from the workspace", async () => {
    asWorkspaceAdmin();
    const res = await workspaceUsersDELETE(
      req("http://localhost", { userDid: DID.workspaceAdmin }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
    const stillMember = await prisma.userWorkspace.findUnique({
      where: {
        userId_workspaceId: {
          userId: DID.workspaceAdmin,
          workspaceId: testWorkspaceId,
        },
      },
    });
    expect(stillMember).not.toBeNull();
  });

  it("a global admin who is a workspace admin still cannot demote themselves", async () => {
    // Global-admin status confers no workspace power, so the self-protection
    // guard applies to them too when they hold a workspace-admin membership.
    const wsId = `workspace-self-${SENTINEL}-${crypto.randomUUID()}`;
    await prisma.workspace.create({
      data: { id: wsId, name: "Self WS", slug: `self-${wsId}`, color: "#6366f1" },
    });
    await prisma.userWorkspace.create({
      data: { userId: DID.admin, workspaceId: wsId, role: "Admin" },
    });
    asAdmin();
    const res = await workspaceUsersPATCH(
      req("http://localhost", { userDid: DID.admin, role: "Member" }) as never,
      params({ id: wsId })
    );
    expectStatus(res, 403);
  });
});

// --- /api/workspaces/[id]/agents ------------------------------------------------

describe("POST /api/workspaces/[id]/agents", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workspaceAgentsPOST(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workspaceAgentsPOST(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a stranger", async () => {
    asStranger();
    const res = await workspaceAgentsPOST(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });

  it("is accessible to a workspace admin", async () => {
    asWorkspaceAdmin();
    const res = await workspaceAgentsPOST(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testWorkspaceId })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });

  it("returns 403 for a global admin who is not a workspace admin", async () => {
    asAdmin();
    const res = await workspaceAgentsPOST(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });
});

describe("DELETE /api/workspaces/[id]/agents", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workspaceAgentsDELETE(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workspaceAgentsDELETE(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });
});

// --- /api/workspaces/[id]/users -------------------------------------------------

describe("POST /api/workspaces/[id]/users", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workspaceUsersPOST(
      req("http://localhost", { userDid: DID.stranger }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workspaceUsersPOST(
      req("http://localhost", { userDid: DID.stranger }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });

  it("is accessible to a workspace admin", async () => {
    asWorkspaceAdmin();
    const res = await workspaceUsersPOST(
      req("http://localhost", { userDid: DID.stranger }) as never,
      params({ id: testWorkspaceId })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    // Clean up so the stranger's membership doesn't leak
    await prisma.userWorkspace.deleteMany({
      where: { userId: DID.stranger, workspaceId: testWorkspaceId },
    });
  });
});

describe("PATCH /api/workspaces/[id]/users — workspace admin toggle", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workspaceUsersPATCH(
      req("http://localhost", {
        userDid: DID.member,
        role: "Admin",
      }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workspaceUsersPATCH(
      req("http://localhost", {
        userDid: DID.member,
        role: "Admin",
      }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });

  it("is accessible to a workspace admin", async () => {
    asWorkspaceAdmin();
    const res = await workspaceUsersPATCH(
      req("http://localhost", {
        userDid: DID.member,
        role: "Member",
      }) as never,
      params({ id: testWorkspaceId })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

describe("DELETE /api/workspaces/[id]/users", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workspaceUsersDELETE(
      req("http://localhost", { userDid: DID.member }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workspaceUsersDELETE(
      req("http://localhost", { userDid: DID.member }) as never,
      params({ id: testWorkspaceId })
    );
    expectStatus(res, 403);
  });
});

// --- /api/workflows ---------------------------------------------------------

describe("GET /api/workflows", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workflowsGET(
      req("http://localhost/api/workflows") as never
    );
    expectStatus(res, 401);
  });

  it("succeeds for a global admin", async () => {
    asAdmin();
    const res = await workflowsGET(
      req("http://localhost/api/workflows") as never
    );
    expectStatus(res, 200);
  });

  it("member receives only their workspace's workflows", async () => {
    asMember();
    const res = await workflowsGET(
      req("http://localhost/api/workflows") as never
    );
    expectStatus(res, 200);
    const body = (res as { _body: { workflows: { id: string }[] } })._body;
    const ids = body.workflows.map((w) => w.id);
    expect(ids).toContain(testWorkflowId);
  });

  it("stranger receives no workflows", async () => {
    asStranger();
    const res = await workflowsGET(
      req("http://localhost/api/workflows") as never
    );
    expectStatus(res, 200);
    const body = (res as { _body: { workflows: unknown[] } })._body;
    expect(body.workflows).toHaveLength(0);
  });
});

describe("POST /api/workflows", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workflowsPOST(
      req("http://localhost", {
        name: "W",
        definition: { nodes: [], edges: [] },
        workspaceId: testWorkspaceId,
      }) as never
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workflowsPOST(
      req("http://localhost", {
        name: "W",
        definition: { nodes: [], edges: [] },
        workspaceId: testWorkspaceId,
      }) as never
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a stranger", async () => {
    asStranger();
    const res = await workflowsPOST(
      req("http://localhost", {
        name: "W",
        definition: { nodes: [], edges: [] },
        workspaceId: testWorkspaceId,
      }) as never
    );
    expectStatus(res, 403);
  });

  it("is accessible to a workspace admin", async () => {
    asWorkspaceAdmin();
    const res = await workflowsPOST(
      req("http://localhost", {
        name: "Workspace Admin WF",
        definition: { nodes: [], edges: [] },
        workspaceId: testWorkspaceId,
      }) as never
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    const body = (res as { _body: { id?: string } })._body;
    if (body.id) await prisma.workflow.deleteMany({ where: { id: body.id } });
  });

  it("returns 403 for a global admin creating a workflow in a workspace they don't admin", async () => {
    asAdmin();
    const res = await workflowsPOST(
      req("http://localhost", {
        name: "Admin WF",
        definition: { nodes: [], edges: [] },
        workspaceId: testWorkspaceId,
      }) as never
    );
    expectStatus(res, 403);
  });
});

// --- /api/workflows/[id] ----------------------------------------------------

describe("GET /api/workflows/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workflowDetailGET(
      req() as never,
      params({ id: testWorkflowId })
    );
    expectStatus(res, 401);
  });

  it("returns 200 for a member of the workflow's workspace", async () => {
    asMember();
    const res = await workflowDetailGET(
      req() as never,
      params({ id: testWorkflowId })
    );
    expectStatus(res, 200);
  });

  it("returns 403 for a stranger", async () => {
    asStranger();
    const res = await workflowDetailGET(
      req() as never,
      params({ id: testWorkflowId })
    );
    expectStatus(res, 403);
  });
});

describe("PATCH /api/workflows/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workflowDetailPATCH(
      req("http://localhost", { name: "Updated" }) as never,
      params({ id: testWorkflowId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workflowDetailPATCH(
      req("http://localhost", { name: "Updated" }) as never,
      params({ id: testWorkflowId })
    );
    expectStatus(res, 403);
  });

  it("is accessible to a workspace admin", async () => {
    asWorkspaceAdmin();
    const res = await workflowDetailPATCH(
      req("http://localhost", { name: "Workspace Admin Update" }) as never,
      params({ id: testWorkflowId })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

describe("DELETE /api/workflows/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workflowDetailDELETE(
      req() as never,
      params({ id: testWorkflowId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workflowDetailDELETE(
      req() as never,
      params({ id: testWorkflowId })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a stranger", async () => {
    asStranger();
    const res = await workflowDetailDELETE(
      req() as never,
      params({ id: testWorkflowId })
    );
    expectStatus(res, 403);
  });
});

// --- /api/admin/registrations -----------------------------------------------------

describe("GET /api/admin/registrations", () => {
  it("is accessible to a global admin", async () => {
    asAdmin();
    const res = await registrationsGET(
      req("http://localhost/api/admin/registrations") as never
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

// --- /api/admin/policies -----------------------------------------------------------

describe("GET /api/admin/policies", () => {
  it("returns 200 with policies array for a global admin", async () => {
    asAdmin();
    const res = await policiesGET(
      req("http://localhost/api/admin/policies") as never
    );
    expectStatus(res, 200);
    const body = (res as { _body: { policies: unknown[] } })._body;
    expect(Array.isArray(body.policies)).toBe(true);
  });

  it("accepts agentDid query param and returns only matching policies", async () => {
    asAdmin();
    const policy = await PolicyDAO.create({
      capabilities: ["file_access"] as any,
      agentDid: DID.agent,
      createdBy: DID.admin,
    });
    const res = await policiesGET(
      req(
        `http://localhost/api/admin/policies?agentDid=${encodeURIComponent(DID.agent)}`
      ) as never
    );
    expectStatus(res, 200);
    const body = (res as { _body: { policies: { id: string }[] } })._body;
    expect(body.policies.some((p) => p.id === policy.id)).toBe(true);
    await PolicyDAO.delete(policy.id);
  });
});

describe("POST /api/admin/policies", () => {
  it("returns 400 when capabilities is missing or empty", async () => {
    asAdmin();
    const res = await policiesPOST(
      req("http://localhost", {
        capabilities: [],
        agentDid: DID.agent,
      }) as never
    );
    expectStatus(res, 400);
  });

  it("returns 400 when capabilities is not an array", async () => {
    asAdmin();
    const res = await policiesPOST(
      req("http://localhost", { capabilities: "file_access" }) as never
    );
    expectStatus(res, 400);
  });

  it("creates a policy and returns 201 for a global admin", async () => {
    asAdmin(DID.admin);
    const res = await policiesPOST(
      req("http://localhost", {
        capabilities: ["file_access"],
        agentDid: DID.agent,
      }) as never
    );
    expectStatus(res, 201);
    const body = (
      res as {
        _body: {
          policy: { id: string; capabilities: string[]; agentDid: string };
        };
      }
    )._body;
    expect(body.policy?.id).toBeTruthy();
    expect(body.policy?.capabilities).toContain("file_access");
    expect(body.policy?.agentDid).toBe(DID.agent);
    await PolicyDAO.delete(body.policy.id);
  });

  it("creates a policy with resourceLimits and expiresAt", async () => {
    asAdmin(DID.admin);
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const res = await policiesPOST(
      req("http://localhost", {
        capabilities: ["api_call"],
        agentDid: DID.agent,
        resourceLimits: { maxTokensPerDay: 10000, maxRequestsPerHour: 60 },
        expiresAt,
      }) as never
    );
    expectStatus(res, 201);
    const body = (
      res as {
        _body: {
          policy: { id: string; resourceLimits: Record<string, unknown> };
        };
      }
    )._body;
    expect(body.policy?.resourceLimits?.maxTokensPerDay).toBe(10000);
    await PolicyDAO.delete(body.policy.id);
  });

  it("creates a workspace-scoped policy without agentDid", async () => {
    asAdmin(DID.admin);
    const res = await policiesPOST(
      req("http://localhost", {
        capabilities: ["file_access"],
        workspaceId: testWorkspaceId,
      }) as never
    );
    expectStatus(res, 201);
    const body = (res as { _body: { policy: { id: string; workspaceId: string } } })
      ._body;
    expect(body.policy?.workspaceId).toBe(testWorkspaceId);
    await PolicyDAO.delete(body.policy.id);
  });
});

describe("GET /api/admin/policies/[id]", () => {
  let testPolicyId: string;

  beforeAll(async () => {
    const p = await PolicyDAO.create({
      capabilities: ["file_access"] as any,
      agentDid: DID.agent,
      createdBy: DID.admin,
    });
    testPolicyId = p.id;
  });

  afterAll(async () => {
    await PolicyDAO.delete(testPolicyId);
  });

  it("returns 404 for a non-existent policy", async () => {
    asAdmin();
    const res = await policyDetailGET(
      req() as never,
      params({ id: "non-existent-policy-id" })
    );
    expectStatus(res, 404);
  });

  it("returns 200 with full policy for a global admin", async () => {
    asAdmin();
    const res = await policyDetailGET(
      req() as never,
      params({ id: testPolicyId })
    );
    expectStatus(res, 200);
    const body = (
      res as {
        _body: {
          policy: { id: string; capabilities: string[]; agentDid: string };
        };
      }
    )._body;
    expect(body.policy?.id).toBe(testPolicyId);
    expect(body.policy?.capabilities).toContain("file_access");
    expect(body.policy?.agentDid).toBe(DID.agent);
  });
});

describe("DELETE /api/admin/policies/[id]", () => {
  it("returns 404 for a non-existent policy id", async () => {
    asAdmin();
    const res = await policyDetailDELETE(
      req() as never,
      params({ id: "non-existent-id" })
    );
    expectStatus(res, 404);
  });

  it("deletes a policy and returns ok:true for a global admin", async () => {
    const p = await PolicyDAO.create({
      capabilities: ["api_call"] as any,
      agentDid: DID.agent,
      createdBy: DID.admin,
    });
    asAdmin();
    const res = await policyDetailDELETE(req() as never, params({ id: p.id }));
    expectStatus(res, 200);
    const body = (res as { _body: { ok: boolean; sentTo: string[] } })._body;
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.sentTo)).toBe(true);
    // Policy is gone — a second DELETE should 404
    asAdmin();
    const res2 = await policyDetailDELETE(req() as never, params({ id: p.id }));
    expectStatus(res2, 404);
  });
});
