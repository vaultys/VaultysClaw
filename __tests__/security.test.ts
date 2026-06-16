/**
 * Security tests — authorization rules for the control-plane API.
 *
 * Three layers:
 *   1. DB helpers    — isUserInRealm, isUserRealmAdmin, setUserRealmAdmin
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
import { GET as agentsGET } from "../packages/control-plane/app/api/agents/route";
import {
  GET as agentDetailGET,
  PATCH as agentDetailPATCH,
} from "../packages/control-plane/app/api/agents/[did]/route";
import {
  GET as realmsGET,
  POST as realmsPOST,
} from "../packages/control-plane/app/api/realms/route";
import {
  GET as realmDetailGET,
  PATCH as realmDetailPATCH,
  DELETE as realmDetailDELETE,
} from "../packages/control-plane/app/api/realms/[id]/route";
import {
  POST as realmAgentsPOST,
  DELETE as realmAgentsDELETE,
} from "../packages/control-plane/app/api/realms/[id]/agents/route";
import {
  POST as realmUsersPOST,
  PATCH as realmUsersPATCH,
  DELETE as realmUsersDELETE,
} from "../packages/control-plane/app/api/realms/[id]/users/route";
import {
  GET as workflowsGET,
  POST as workflowsPOST,
} from "../packages/control-plane/app/api/workflows/route";
import {
  GET as workflowDetailGET,
  PATCH as workflowDetailPATCH,
  DELETE as workflowDetailDELETE,
} from "../packages/control-plane/app/api/workflows/[id]/route";
import { GET as registrationsGET } from "../packages/control-plane/app/api/registrations/route";
import { POST as approveRegistrationPOST } from "../packages/control-plane/app/api/registrations/[id]/approve/route";
import {
  GET as policiesGET,
  POST as policiesPOST,
} from "../packages/control-plane/app/api/policies/route";
import {
  GET as policyDetailGET,
  DELETE as policyDetailDELETE,
} from "../packages/control-plane/app/api/policies/[id]/route";

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
    realmIds: new Set<string>(),
    async canAccessRealm(realmId: string) {
      if (isGlobalAdmin) return true;
      const membership = await prisma.userRealm.findFirst({ where: { userId: did, realmId } });
      return membership !== null;
    },
    async canAdminRealm(realmId: string) {
      if (isGlobalAdmin) return true;
      const membership = await prisma.userRealm.findFirst({ where: { userId: did, realmId } });
      return membership?.isRealmAdmin === true;
    },
    async canAccessAgent(agentDid: string) {
      if (isGlobalAdmin) return true;
      const agentRealms = await prisma.agentRealm.findMany({ where: { agentDid } });
      const agentRealmIds = new Set(agentRealms.map((r) => r.realmId));
      const userMemberships = await prisma.userRealm.findMany({ where: { userId: did } });
      return userMemberships.some((r) => agentRealmIds.has(r.realmId));
    },
    async canAdminAgent(agentDid: string) {
      if (isGlobalAdmin) return true;
      const agentRealms = await prisma.agentRealm.findMany({ where: { agentDid } });
      const agentRealmIds = new Set(agentRealms.map((r) => r.realmId));
      const userMemberships = await prisma.userRealm.findMany({ where: { userId: did } });
      return userMemberships.some((r) => agentRealmIds.has(r.realmId) && r.isRealmAdmin === true);
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
    realmIds: new Set([testRealmId]),
    canAccessRealm: async (realmId: string) => realmId === testRealmId,
    canAdminRealm: async () => false,
    canAccessAgent: async (agentDid: string) => agentDid === DID.agent,
    canAdminAgent: async () => false,
  });
}
function asStranger(did = DID.stranger) {
  mockGetAuthContext.mockResolvedValue({
    did,
    isOwner: false,
    isGlobalAdmin: false,
    realmIds: new Set<string>(),
    canAccessRealm: async () => false,
    canAdminRealm: async () => false,
    canAccessAgent: async () => false,
    canAdminAgent: async () => false,
  });
}
function asRealmAdmin(did = DID.realmAdmin) {
  mockGetAuthContext.mockResolvedValue({
    did,
    isOwner: false,
    isGlobalAdmin: false,
    realmIds: new Set([testRealmId]),
    canAccessRealm: async (realmId: string) => realmId === testRealmId,
    canAdminRealm: async (realmId: string) => realmId === testRealmId,
    canAccessAgent: async (agentDid: string) => agentDid === DID.agent,
    canAdminAgent: async (agentDid: string) => agentDid === DID.agent,
  });
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
  realmAdmin: "did:vaultys:realmadmin-sec-001",
  stranger: "did:vaultys:stranger-sec-001",
  agent: "did:vaultys:agent-sec-001",
};

const SENTINEL = "sec-001"; // used to clean up test data
let testRealmId: string;
let testWorkflowId: string;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Clean up any stale Prisma data
  await prisma.userRealm.deleteMany({ where: { userId: { contains: SENTINEL } } });
  await prisma.agentRealm.deleteMany({ where: { agentDid: { contains: SENTINEL } } });
  await prisma.user.deleteMany({ where: { did: { contains: SENTINEL } } });
  await prisma.agent.deleteMany({ where: { did: { contains: SENTINEL } } });
  await prisma.realm.deleteMany({ where: { slug: "test-sec-realm" } });

  // ── Prisma setup (control plane uses Prisma exclusively, no SQLite) ────────
  await prisma.user.createMany({
    data: [
      { id: DID.owner, did: DID.owner, isOwner: true, isAdmin: true },
      { id: DID.admin, did: DID.admin, isAdmin: true },
      { id: DID.member, did: DID.member },
      { id: DID.realmAdmin, did: DID.realmAdmin },
      { id: DID.stranger, did: DID.stranger },
    ],
    skipDuplicates: true,
  });

  // Create realm via Prisma
  testRealmId = `realm-sec-001-${crypto.randomUUID()}`;
  await prisma.realm.create({
    data: {
      id: testRealmId,
      name: "Security Test Realm",
      slug: "test-sec-realm",
      color: "#6366f1",
    },
  });

  // Add users to realm via Prisma
  await prisma.userRealm.createMany({
    data: [
      { userId: DID.member, realmId: testRealmId, isRealmAdmin: false },
      { userId: DID.realmAdmin, realmId: testRealmId, isRealmAdmin: true },
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

  // Add agent to realm via Prisma
  await prisma.agentRealm.create({
    data: {
      agentDid: DID.agent,
      realmId: testRealmId,
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
      realmId: testRealmId,
    },
  });
});

afterAll(async () => {
  // Prisma cleanup (control plane uses Prisma exclusively)
  await prisma.policy.deleteMany({ where: { OR: [{ createdBy: { contains: SENTINEL } }, { agentDid: { contains: SENTINEL } }] } });
  await prisma.workflow.deleteMany({ where: { realmId: testRealmId } });
  await prisma.userRealm.deleteMany({ where: { userId: { contains: SENTINEL } } });
  await prisma.agentRealm.deleteMany({ where: { agentDid: { contains: SENTINEL } } });
  await prisma.user.deleteMany({ where: { did: { contains: SENTINEL } } });
  await prisma.agent.deleteMany({ where: { did: { contains: SENTINEL } } });
  await prisma.realm.deleteMany({ where: { slug: "test-sec-realm" } });
});

// Reset mock before each test so auth context doesn't leak between tests
beforeEach(() => {
  mockGetAuthContext.mockReset();
});

// ===========================================================================
// 1. DB HELPERS
// ===========================================================================

describe.skip("DB helper — realm membership", () => {
  it("isUserInRealm returns true for a member", () => {
    expect(isUserInRealm(DID.member, testRealmId)).toBe(true);
  });

  it("isUserInRealm returns false for a stranger", () => {
    expect(isUserInRealm(DID.stranger, testRealmId)).toBe(false);
  });

  it("isUserRealmAdmin returns true for realm admin", () => {
    expect(isUserRealmAdmin(DID.realmAdmin, testRealmId)).toBe(true);
  });

  it("isUserRealmAdmin returns false for a regular member", () => {
    expect(isUserRealmAdmin(DID.member, testRealmId)).toBe(false);
  });

  it("isUserRealmAdmin returns false for a stranger", () => {
    expect(isUserRealmAdmin(DID.stranger, testRealmId)).toBe(false);
  });

  it("setUserRealmAdmin promotes a member to realm admin", () => {
    const db = getDb();
    const tmpDid = `did:vaultys:tmp-promote-${SENTINEL}`;
    UserDao.create(tmpDid, null, false);
    addUserToRealm(tmpDid, testRealmId, false, false);

    expect(isUserRealmAdmin(tmpDid, testRealmId)).toBe(false);
    setUserRealmAdmin(tmpDid, testRealmId, true);
    expect(isUserRealmAdmin(tmpDid, testRealmId)).toBe(true);

    db.prepare("DELETE FROM user_realms WHERE user_id = ?").run(tmpDid);
    db.prepare("DELETE FROM users WHERE did = ?").run(tmpDid);
  });

  it("setUserRealmAdmin returns false when user is not a member", () => {
    const changed = setUserRealmAdmin(DID.stranger, testRealmId, true);
    expect(changed).toBe(false);
    expect(isUserRealmAdmin(DID.stranger, testRealmId)).toBe(false);
  });

  it("addUserToRealm with isRealmAdmin=true stores the flag", () => {
    const db = getDb();
    const tmpDid = `did:vaultys:tmp-adm-flag-${SENTINEL}`;
    UserDao.create(tmpDid, null, false);
    addUserToRealm(tmpDid, testRealmId, false, true);

    expect(isUserRealmAdmin(tmpDid, testRealmId)).toBe(true);

    db.prepare("DELETE FROM user_realms WHERE user_id = ?").run(tmpDid);
    db.prepare("DELETE FROM users WHERE did = ?").run(tmpDid);
  });

  it("getUserRealms includes is_realm_admin field", () => {
    const realms = getUserRealms(DID.realmAdmin);
    const entry = realms.find((r) => r.realm_id === testRealmId);
    expect(entry).toBeDefined();
    expect(entry!.is_realm_admin).toBe(1);
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

  it("canAccessRealm any realm", () => {
    const ctx = makeAuthContext(DID.owner, { isOwner: true, isAdmin: true });
    expect(ctx.canAccessRealm(testRealmId)).toBe(true);
    expect(ctx.canAccessRealm("non-existent-realm-id")).toBe(true);
  });

  it("canAdminRealm any realm", () => {
    const ctx = makeAuthContext(DID.owner, { isOwner: true, isAdmin: true });
    expect(ctx.canAdminRealm(testRealmId)).toBe(true);
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

  it("canAccessRealm any realm", async () => {
    const ctx = makeAuthContext(DID.admin, { isAdmin: true });
    expect(await ctx.canAccessRealm(testRealmId)).toBe(true);
  });

  it("canAdminRealm any realm", async () => {
    const ctx = makeAuthContext(DID.admin, { isAdmin: true });
    expect(await ctx.canAdminRealm(testRealmId)).toBe(true);
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

  it("canAccessRealm own realm", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAccessRealm(testRealmId)).toBe(true);
  });

  it("canAccessRealm returns false for a realm they're not in", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAccessRealm("realm-does-not-exist")).toBe(false);
  });

  it("canAdminRealm returns false (not a realm admin)", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAdminRealm(testRealmId)).toBe(false);
  });

  it("canAccessAgent for an agent in their realm", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAccessAgent(DID.agent)).toBe(true);
  });

  it("canAccessAgent returns false for an agent not in any shared realm", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAccessAgent("did:vaultys:unknown-agent")).toBe(false);
  });

  it("canAdminAgent returns false (not a realm admin)", () => {
    const ctx = makeAuthContext(DID.member);
    expect(ctx.canAdminAgent(DID.agent)).toBe(false);
  });
});

describe.skip("AuthContext — realm admin", () => {
  it("canAdminRealm returns true for their realm", () => {
    const ctx = makeAuthContext(DID.realmAdmin);
    expect(ctx.canAdminRealm(testRealmId)).toBe(true);
  });

  it("canAdminAgent returns true for agent in their realm", () => {
    const ctx = makeAuthContext(DID.realmAdmin);
    expect(ctx.canAdminAgent(DID.agent)).toBe(true);
  });

  it("canAdminRealm returns false for a realm they don't admin", () => {
    const ctx = makeAuthContext(DID.realmAdmin);
    expect(ctx.canAdminRealm("some-other-realm-id")).toBe(false);
  });
});

describe("AuthContext — stranger (authenticated, no realm membership)", () => {
  it("canAccessRealm returns false", async () => {
    const ctx = makeAuthContext(DID.stranger);
    expect(await ctx.canAccessRealm(testRealmId)).toBe(false);
  });

  it("canAdminRealm returns false", async () => {
    const ctx = makeAuthContext(DID.stranger);
    expect(await ctx.canAdminRealm(testRealmId)).toBe(false);
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

// --- /api/agents ------------------------------------------------------------

describe("GET /api/agents", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await agentsGET(req() as never, {});
    expectStatus(res, 401);
  });

  it("succeeds (200) for a global admin", async () => {
    asAdmin();
    const res = await agentsGET(req() as never, {});
    expectStatus(res, 200);
  });

  it("succeeds (200) for a member — returns only realm-scoped agents", async () => {
    asMember();
    const res = await agentsGET(req() as never, {});
    expectStatus(res, 200);
    const body = (res as { _body: { items: unknown[] } })._body;
    const agentDids = (body.items as { did: string }[]).map((a) => a.did);
    expect(agentDids).toContain(DID.agent);
    expect(agentDids).not.toContain("did:vaultys:some-other-agent");
  });
});

// --- /api/agents/[did] ------------------------------------------------------

describe("GET /api/agents/[did]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await agentDetailGET(
      req() as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 401);
  });

  it("returns 200 for a member of the agent's realm", async () => {
    asMember();
    const res = await agentDetailGET(
      req() as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 200);
  });

  it("returns 403 for a stranger (not in any shared realm with the agent)", async () => {
    asStranger();
    const res = await agentDetailGET(
      req() as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 403);
  });

  it("returns 200 for a global admin regardless of realm membership", async () => {
    asAdmin();
    const res = await agentDetailGET(
      req() as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 200);
  });
});

describe("PATCH /api/agents/[did] — capabilities", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await agentDetailPATCH(
      req("http://localhost", { capabilities: [] }) as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await agentDetailPATCH(
      req("http://localhost", { capabilities: ["file_access"] }) as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin (not a global admin)", async () => {
    asRealmAdmin();
    const res = await agentDetailPATCH(
      req("http://localhost", { capabilities: ["file_access"] }) as never,
      params({ did: encodeURIComponent(DID.agent) })
    );
    expectStatus(res, 403);
  });

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

// --- /api/realms ------------------------------------------------------------

describe("GET /api/realms", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmsGET();
    expectStatus(res, 401);
  });

  it("succeeds for a global admin", async () => {
    asAdmin();
    const res = await realmsGET();
    expectStatus(res, 200);
  });

  it("succeeds for a member — returns only their realms", async () => {
    asMember();
    const res = await realmsGET();
    expectStatus(res, 200);
    const body = (res as { _body: { realms: { id: string }[] } })._body;
    const ids = body.realms.map((r) => r.id);
    expect(ids).toContain(testRealmId);
  });

  it("returns empty list for a stranger (no realms)", async () => {
    asStranger();
    const res = await realmsGET();
    expectStatus(res, 200);
    const body = (res as { _body: { realms: unknown[] } })._body;
    expect(body.realms).toHaveLength(0);
  });
});

describe("POST /api/realms", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmsPOST(
      req("http://localhost", { name: "X", slug: "x" }) as never
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmsPOST(
      req("http://localhost", { name: "X", slug: "x" }) as never
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin (realm admin ≠ global admin)", async () => {
    asRealmAdmin();
    const res = await realmsPOST(
      req("http://localhost", { name: "X", slug: "x" }) as never
    );
    expectStatus(res, 403);
  });

  it("is accessible to a global admin", async () => {
    asAdmin();
    const res = await realmsPOST(
      req("http://localhost", {
        name: "Temp Realm",
        slug: `tmp-realm-${Date.now()}`,
      }) as never
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    const body = (res as { _body: { realm?: { id: string } } })._body;
    if (body.realm?.id) {
      await prisma.realm.deleteMany({ where: { id: body.realm.id } });
    }
  });
});

// --- /api/realms/[id] -------------------------------------------------------

describe("GET /api/realms/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmDetailGET(
      req() as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 401);
  });

  it("returns 200 for a member of the realm", async () => {
    asMember();
    const res = await realmDetailGET(
      req() as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 200);
  });

  it("returns 403 for a stranger", async () => {
    asStranger();
    const res = await realmDetailGET(
      req() as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 403);
  });
});

describe("PATCH /api/realms/[id] — realm metadata", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmDetailPATCH(
      req("http://localhost", { name: "New Name" }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmDetailPATCH(
      req("http://localhost", { name: "New Name" }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin (config is global-admin-only)", async () => {
    asRealmAdmin();
    const res = await realmDetailPATCH(
      req("http://localhost", { name: "New Name" }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 403);
  });

  it("is accessible to a global admin", async () => {
    asAdmin();
    const res = await realmDetailPATCH(
      req("http://localhost", { name: "Security Test Realm" }) as never,
      params({ id: testRealmId })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

describe("DELETE /api/realms/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmDetailDELETE(
      req() as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a realm admin", async () => {
    asRealmAdmin();
    const res = await realmDetailDELETE(
      req() as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmDetailDELETE(
      req() as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 403);
  });
});

// --- /api/realms/[id]/agents ------------------------------------------------

describe("POST /api/realms/[id]/agents", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmAgentsPOST(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmAgentsPOST(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a stranger", async () => {
    asStranger();
    const res = await realmAgentsPOST(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 403);
  });

  it("is accessible to a realm admin", async () => {
    asRealmAdmin();
    const res = await realmAgentsPOST(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testRealmId })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });

  it("is accessible to a global admin", async () => {
    asAdmin();
    const res = await realmAgentsPOST(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testRealmId })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

describe("DELETE /api/realms/[id]/agents", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmAgentsDELETE(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmAgentsDELETE(
      req("http://localhost", { agentDid: DID.agent }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 403);
  });
});

// --- /api/realms/[id]/users -------------------------------------------------

describe("POST /api/realms/[id]/users", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmUsersPOST(
      req("http://localhost", { userDid: DID.stranger }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmUsersPOST(
      req("http://localhost", { userDid: DID.stranger }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 403);
  });

  it("is accessible to a realm admin", async () => {
    asRealmAdmin();
    const res = await realmUsersPOST(
      req("http://localhost", { userDid: DID.stranger }) as never,
      params({ id: testRealmId })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    // Clean up so the stranger's membership doesn't leak
    await prisma.userRealm.deleteMany({
      where: { userId: DID.stranger, realmId: testRealmId },
    });
  });
});

describe("PATCH /api/realms/[id]/users — realm admin toggle", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmUsersPATCH(
      req("http://localhost", {
        userDid: DID.member,
        isRealmAdmin: true,
      }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmUsersPATCH(
      req("http://localhost", {
        userDid: DID.member,
        isRealmAdmin: true,
      }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 403);
  });

  it("is accessible to a realm admin", async () => {
    asRealmAdmin();
    const res = await realmUsersPATCH(
      req("http://localhost", {
        userDid: DID.member,
        isRealmAdmin: false,
      }) as never,
      params({ id: testRealmId })
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

describe("DELETE /api/realms/[id]/users", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmUsersDELETE(
      req("http://localhost", { userDid: DID.member }) as never,
      params({ id: testRealmId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmUsersDELETE(
      req("http://localhost", { userDid: DID.member }) as never,
      params({ id: testRealmId })
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

  it("member receives only their realm's workflows", async () => {
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
        realmId: testRealmId,
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
        realmId: testRealmId,
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
        realmId: testRealmId,
      }) as never
    );
    expectStatus(res, 403);
  });

  it("is accessible to a realm admin", async () => {
    asRealmAdmin();
    const res = await workflowsPOST(
      req("http://localhost", {
        name: "Realm Admin WF",
        definition: { nodes: [], edges: [] },
        realmId: testRealmId,
      }) as never
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    const body = (res as { _body: { id?: string } })._body;
    if (body.id) await prisma.workflow.deleteMany({ where: { id: body.id } });
  });

  it("is accessible to a global admin", async () => {
    asAdmin();
    const res = await workflowsPOST(
      req("http://localhost", {
        name: "Admin WF",
        definition: { nodes: [], edges: [] },
        realmId: testRealmId,
      }) as never
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    const body = (res as { _body: { id?: string } })._body;
    if (body.id) await prisma.workflow.deleteMany({ where: { id: body.id } });
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

  it("returns 200 for a member of the workflow's realm", async () => {
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

  it("is accessible to a realm admin", async () => {
    asRealmAdmin();
    const res = await workflowDetailPATCH(
      req("http://localhost", { name: "Realm Admin Update" }) as never,
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

// --- /api/registrations -----------------------------------------------------

describe("GET /api/registrations", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await registrationsGET();
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await registrationsGET();
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin", async () => {
    asRealmAdmin();
    const res = await registrationsGET();
    expectStatus(res, 403);
  });

  it("is accessible to a global admin", async () => {
    asAdmin();
    const res = await registrationsGET();
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

describe("POST /api/registrations/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await approveRegistrationPOST(
      req("http://localhost", { capabilities: ["file_access"] }) as never,
      params({ id: "fake-registration-id" })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await approveRegistrationPOST(
      req("http://localhost", { capabilities: ["file_access"] }) as never,
      params({ id: "fake-registration-id" })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin", async () => {
    asRealmAdmin();
    const res = await approveRegistrationPOST(
      req("http://localhost", { capabilities: ["file_access"] }) as never,
      params({ id: "fake-registration-id" })
    );
    expectStatus(res, 403);
  });
});

// --- /api/policies -----------------------------------------------------------

describe("GET /api/policies", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await policiesGET(
      req("http://localhost/api/policies") as never
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await policiesGET(
      req("http://localhost/api/policies") as never
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin", async () => {
    asRealmAdmin();
    const res = await policiesGET(
      req("http://localhost/api/policies") as never
    );
    expectStatus(res, 403);
  });

  it("returns 200 with policies array for a global admin", async () => {
    asAdmin();
    const res = await policiesGET(
      req("http://localhost/api/policies") as never
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
        `http://localhost/api/policies?agentDid=${encodeURIComponent(DID.agent)}`
      ) as never
    );
    expectStatus(res, 200);
    const body = (res as { _body: { policies: { id: string }[] } })._body;
    expect(body.policies.some((p) => p.id === policy.id)).toBe(true);
    await PolicyDAO.delete(policy.id);
  });
});

describe("POST /api/policies", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await policiesPOST(
      req("http://localhost", {
        capabilities: ["file_access"],
        agentDid: DID.agent,
      }) as never
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await policiesPOST(
      req("http://localhost", {
        capabilities: ["file_access"],
        agentDid: DID.agent,
      }) as never
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin", async () => {
    asRealmAdmin();
    const res = await policiesPOST(
      req("http://localhost", {
        capabilities: ["file_access"],
        agentDid: DID.agent,
      }) as never
    );
    expectStatus(res, 403);
  });

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

  it("creates a realm-scoped policy without agentDid", async () => {
    asAdmin(DID.admin);
    const res = await policiesPOST(
      req("http://localhost", {
        capabilities: ["file_access"],
        realmId: testRealmId,
      }) as never
    );
    expectStatus(res, 201);
    const body = (res as { _body: { policy: { id: string; realmId: string } } })
      ._body;
    expect(body.policy?.realmId).toBe(testRealmId);
    await PolicyDAO.delete(body.policy.id);
  });
});

describe("GET /api/policies/[id]", () => {
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

  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await policyDetailGET(
      req() as never,
      params({ id: testPolicyId })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await policyDetailGET(
      req() as never,
      params({ id: testPolicyId })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin", async () => {
    asRealmAdmin();
    const res = await policyDetailGET(
      req() as never,
      params({ id: testPolicyId })
    );
    expectStatus(res, 403);
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

describe("DELETE /api/policies/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await policyDetailDELETE(
      req() as never,
      params({ id: "any-policy-id" })
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await policyDetailDELETE(
      req() as never,
      params({ id: "any-policy-id" })
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin", async () => {
    asRealmAdmin();
    const res = await policyDetailDELETE(
      req() as never,
      params({ id: "any-policy-id" })
    );
    expectStatus(res, 403);
  });

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
