/**
 * Security tests — authorization rules for the control-plane API.
 *
 * Three layers:
 *   1. DB helpers    — isUserInRealm, isUserRealmAdmin, setUserRealmAdmin
 *   2. Auth context  — getAuthContext() per role (owner / admin / member / stranger)
 *   3. Route handlers — 401 when unauthenticated, 403 when insufficient role
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that transitively uses them
// ---------------------------------------------------------------------------

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      _status: init?.status ?? 200,
      async json() { return body; },
    }),
  },
}));

vi.mock("@/lib/auth-config", () => ({ authOptions: {} }));

// Stub the WS server — route handlers call getWSServer() but we don't need it
vi.mock("@/lib/ws-server", () => ({ getWSServer: vi.fn(() => null) }));

// Stub workflow-executor to prevent file-system side-effects
vi.mock("@/lib/workflow-executor", () => ({ executeWorkflow: vi.fn() }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { getServerSession } from "next-auth";
import {
  getDb,
  createRealm,
  addUserToRealm,
  addAgentToRealm,
  isUserInRealm,
  isUserRealmAdmin,
  setUserRealmAdmin,
  getUserRealms,
  saveWorkflow,
  type WorkflowDefinition,
} from "../packages/control-plane/lib/db";
import { UserDao } from "../packages/control-plane/lib/user-dao";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";

// Route handlers under test
import { GET as agentsGET } from "../packages/control-plane/app/api/agents/route";
import { GET as agentDetailGET, PATCH as agentDetailPATCH } from "../packages/control-plane/app/api/agents/[did]/route";
import { GET as realmsGET, POST as realmsPOST } from "../packages/control-plane/app/api/realms/route";
import { GET as realmDetailGET, PATCH as realmDetailPATCH, DELETE as realmDetailDELETE } from "../packages/control-plane/app/api/realms/[id]/route";
import { POST as realmAgentsPOST, DELETE as realmAgentsDELETE } from "../packages/control-plane/app/api/realms/[id]/agents/route";
import { POST as realmUsersPOST, PATCH as realmUsersPATCH, DELETE as realmUsersDELETE } from "../packages/control-plane/app/api/realms/[id]/users/route";
import { GET as workflowsGET, POST as workflowsPOST } from "../packages/control-plane/app/api/workflows/route";
import { GET as workflowDetailGET, PATCH as workflowDetailPATCH, DELETE as workflowDetailDELETE } from "../packages/control-plane/app/api/workflows/[id]/route";
import { GET as registrationsGET } from "../packages/control-plane/app/api/registrations/route";
import { POST as approveRegistrationPOST } from "../packages/control-plane/app/api/registrations/[id]/approve/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetServerSession = getServerSession as ReturnType<typeof vi.fn>;

function makeSession(did: string, { isOwner = false, isAdmin = false } = {}) {
  return { user: { did, isOwner, isAdmin } };
}

/** Simulate no active session (unauthenticated) */
function asUnauthenticated() {
  mockGetServerSession.mockResolvedValue(null);
}
/** Simulate an owner session */
function asOwner(did = DID.owner) {
  mockGetServerSession.mockResolvedValue(makeSession(did, { isOwner: true, isAdmin: true }));
}
/** Simulate a global admin session */
function asAdmin(did = DID.admin) {
  mockGetServerSession.mockResolvedValue(makeSession(did, { isAdmin: true }));
}
/** Simulate a regular member session */
function asMember(did = DID.member) {
  mockGetServerSession.mockResolvedValue(makeSession(did));
}
/** Simulate a stranger (authenticated, but not in any test realm) */
function asStranger(did = DID.stranger) {
  mockGetServerSession.mockResolvedValue(makeSession(did));
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

  async json() { return this._body; }
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
  owner:    "did:vaultys:owner-sec-001",
  admin:    "did:vaultys:admin-sec-001",
  member:   "did:vaultys:member-sec-001",
  realmAdmin: "did:vaultys:realmadmin-sec-001",
  stranger: "did:vaultys:stranger-sec-001",
  agent:    "did:vaultys:agent-sec-001",
};

const SENTINEL = "sec-001"; // used to clean up test data
let testRealmId: string;
let testWorkflowId: string;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  const db = getDb();

  // Clean up any stale data from a previous interrupted run
  db.prepare(`DELETE FROM user_realms WHERE user_did LIKE '%${SENTINEL}'`).run();
  db.prepare(`DELETE FROM agent_realms WHERE agent_did LIKE '%${SENTINEL}'`).run();
  db.prepare(`DELETE FROM users WHERE did LIKE '%${SENTINEL}'`).run();
  db.prepare(`DELETE FROM agents WHERE did LIKE '%${SENTINEL}'`).run();
  db.prepare("DELETE FROM realms WHERE slug = 'test-sec-realm'").run();

  // Users
  UserDao.create(DID.owner, null, true);
  UserDao.create(DID.admin, null, false);
  UserDao.setAdmin(DID.admin, true);
  UserDao.create(DID.member, null, false);
  UserDao.create(DID.realmAdmin, null, false);
  UserDao.create(DID.stranger, null, false);

  // Agent
  db.prepare(
    "INSERT OR IGNORE INTO agents (did, name, capabilities, registered_at) VALUES (?, ?, '[]', datetime('now'))"
  ).run(DID.agent, "Security Test Agent");

  // Realm
  const realm = createRealm({ name: "Security Test Realm", slug: "test-sec-realm" });
  testRealmId = realm.id;

  // Memberships
  addUserToRealm(DID.member, testRealmId, false, false);
  addUserToRealm(DID.realmAdmin, testRealmId, false, true); // realm admin
  addAgentToRealm(DID.agent, testRealmId);

  // Workflow inside the test realm
  const def: WorkflowDefinition = { nodes: [], edges: [] };
  testWorkflowId = saveWorkflow("Security Test Workflow", def, undefined, testRealmId);
});

afterAll(() => {
  const db = getDb();
  db.prepare(`DELETE FROM user_realms WHERE user_did LIKE '%${SENTINEL}'`).run();
  db.prepare(`DELETE FROM agent_realms WHERE agent_did LIKE '%${SENTINEL}'`).run();
  db.prepare(`DELETE FROM users WHERE did LIKE '%${SENTINEL}'`).run();
  db.prepare(`DELETE FROM agents WHERE did LIKE '%${SENTINEL}'`).run();
  db.prepare("DELETE FROM realms WHERE slug = 'test-sec-realm'").run();
});

// Reset mock before each test so sessions don't leak between tests
beforeEach(() => {
  mockGetServerSession.mockReset();
});

// ===========================================================================
// 1. DB HELPERS
// ===========================================================================

describe("DB helper — realm membership", () => {
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

    // Cleanup
    db.prepare("DELETE FROM user_realms WHERE user_did = ?").run(tmpDid);
    db.prepare("DELETE FROM users WHERE did = ?").run(tmpDid);
  });

  it("setUserRealmAdmin returns false when user is not a member", () => {
    const changed = setUserRealmAdmin(DID.stranger, testRealmId, true);
    expect(changed).toBe(false);
    // stranger is still not an admin
    expect(isUserRealmAdmin(DID.stranger, testRealmId)).toBe(false);
  });

  it("addUserToRealm with isRealmAdmin=true stores the flag", () => {
    const db = getDb();
    const tmpDid = `did:vaultys:tmp-adm-flag-${SENTINEL}`;
    UserDao.create(tmpDid, null, false);
    addUserToRealm(tmpDid, testRealmId, false, true);

    expect(isUserRealmAdmin(tmpDid, testRealmId)).toBe(true);

    db.prepare("DELETE FROM user_realms WHERE user_did = ?").run(tmpDid);
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
// 2. AUTH CONTEXT — getAuthContext() per role
// ===========================================================================

describe("getAuthContext — unauthenticated", () => {
  it("returns null when no session", async () => {
    asUnauthenticated();
    expect(await getAuthContext()).toBeNull();
  });
});

describe("getAuthContext — owner", () => {
  it("isGlobalAdmin is true", async () => {
    asOwner();
    const ctx = await getAuthContext();
    expect(ctx?.isGlobalAdmin).toBe(true);
  });

  it("isOwner is true", async () => {
    asOwner();
    const ctx = await getAuthContext();
    expect(ctx?.isOwner).toBe(true);
  });

  it("canAccessRealm any realm", async () => {
    asOwner();
    const ctx = await getAuthContext();
    expect(ctx?.canAccessRealm(testRealmId)).toBe(true);
    expect(ctx?.canAccessRealm("non-existent-realm-id")).toBe(true);
  });

  it("canAdminRealm any realm", async () => {
    asOwner();
    const ctx = await getAuthContext();
    expect(ctx?.canAdminRealm(testRealmId)).toBe(true);
  });

  it("canAccessAgent any agent", async () => {
    asOwner();
    const ctx = await getAuthContext();
    expect(ctx?.canAccessAgent(DID.agent)).toBe(true);
  });

  it("canAdminAgent any agent", async () => {
    asOwner();
    const ctx = await getAuthContext();
    expect(ctx?.canAdminAgent(DID.agent)).toBe(true);
  });
});

describe("getAuthContext — global admin", () => {
  it("isGlobalAdmin is true, isOwner is false", async () => {
    asAdmin();
    const ctx = await getAuthContext();
    expect(ctx?.isGlobalAdmin).toBe(true);
    expect(ctx?.isOwner).toBe(false);
  });

  it("canAccessRealm any realm", async () => {
    asAdmin();
    const ctx = await getAuthContext();
    expect(ctx?.canAccessRealm(testRealmId)).toBe(true);
  });

  it("canAdminRealm any realm", async () => {
    asAdmin();
    const ctx = await getAuthContext();
    expect(ctx?.canAdminRealm(testRealmId)).toBe(true);
  });

  it("canAccessAgent any agent", async () => {
    asAdmin();
    const ctx = await getAuthContext();
    expect(ctx?.canAccessAgent(DID.agent)).toBe(true);
  });

  it("canAdminAgent any agent", async () => {
    asAdmin();
    const ctx = await getAuthContext();
    expect(ctx?.canAdminAgent(DID.agent)).toBe(true);
  });
});

describe("getAuthContext — regular member", () => {
  it("isGlobalAdmin is false", async () => {
    asMember();
    const ctx = await getAuthContext();
    expect(ctx?.isGlobalAdmin).toBe(false);
    expect(ctx?.isOwner).toBe(false);
  });

  it("canAccessRealm own realm", async () => {
    asMember();
    const ctx = await getAuthContext();
    expect(ctx?.canAccessRealm(testRealmId)).toBe(true);
  });

  it("canAccessRealm returns false for a realm they're not in", async () => {
    asMember();
    const ctx = await getAuthContext();
    expect(ctx?.canAccessRealm("realm-does-not-exist")).toBe(false);
  });

  it("canAdminRealm returns false (not a realm admin)", async () => {
    asMember();
    const ctx = await getAuthContext();
    expect(ctx?.canAdminRealm(testRealmId)).toBe(false);
  });

  it("canAccessAgent for an agent in their realm", async () => {
    asMember();
    const ctx = await getAuthContext();
    expect(ctx?.canAccessAgent(DID.agent)).toBe(true);
  });

  it("canAccessAgent returns false for an agent not in any shared realm", async () => {
    asMember();
    const ctx = await getAuthContext();
    // stranger agent not in any shared realm with member
    expect(ctx?.canAccessAgent("did:vaultys:unknown-agent")).toBe(false);
  });

  it("canAdminAgent returns false (not a realm admin)", async () => {
    asMember();
    const ctx = await getAuthContext();
    expect(ctx?.canAdminAgent(DID.agent)).toBe(false);
  });
});

describe("getAuthContext — realm admin", () => {
  it("canAdminRealm returns true for their realm", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const ctx = await getAuthContext();
    expect(ctx?.canAdminRealm(testRealmId)).toBe(true);
  });

  it("canAdminAgent returns true for agent in their realm", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const ctx = await getAuthContext();
    expect(ctx?.canAdminAgent(DID.agent)).toBe(true);
  });

  it("canAdminRealm returns false for a realm they don't admin", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const ctx = await getAuthContext();
    expect(ctx?.canAdminRealm("some-other-realm-id")).toBe(false);
  });
});

describe("getAuthContext — stranger (authenticated, no realm membership)", () => {
  it("canAccessRealm returns false", async () => {
    asStranger();
    const ctx = await getAuthContext();
    expect(ctx?.canAccessRealm(testRealmId)).toBe(false);
  });

  it("canAdminRealm returns false", async () => {
    asStranger();
    const ctx = await getAuthContext();
    expect(ctx?.canAdminRealm(testRealmId)).toBe(false);
  });

  it("canAccessAgent returns false", async () => {
    asStranger();
    const ctx = await getAuthContext();
    expect(ctx?.canAccessAgent(DID.agent)).toBe(false);
  });
});

// ===========================================================================
// 3. ROUTE HANDLER AUTHORIZATION
// ===========================================================================

// Helper — extracts the status code from our mock NextResponse.json result
function status(res: unknown): number {
  return (res as { _status: number })._status;
}

// --- /api/agents ------------------------------------------------------------

describe("GET /api/agents", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await agentsGET();
    expectStatus(res, 401);
  });

  it("succeeds (200) for a global admin", async () => {
    asAdmin();
    const res = await agentsGET();
    expectStatus(res, 200);
  });

  it("succeeds (200) for a member — returns only realm-scoped agents", async () => {
    asMember();
    const res = await agentsGET();
    expectStatus(res, 200);
    const body = (res as { _body: { agents: unknown[] } })._body;
    // All returned agents should be in the member's realm
    const agentIds = (body.agents as { id: string }[]).map((a) => a.id);
    expect(agentIds).toContain(DID.agent);
    // Agents not in member's realm should be absent
    expect(agentIds).not.toContain("did:vaultys:some-other-agent");
  });
});

// --- /api/agents/[did] ------------------------------------------------------

describe("GET /api/agents/[did]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await agentDetailGET(req() as never, params({ did: encodeURIComponent(DID.agent) }));
    expectStatus(res, 401);
  });

  it("returns 200 for a member of the agent's realm", async () => {
    asMember();
    const res = await agentDetailGET(req() as never, params({ did: encodeURIComponent(DID.agent) }));
    expectStatus(res, 200);
  });

  it("returns 403 for a stranger (not in any shared realm with the agent)", async () => {
    asStranger();
    const res = await agentDetailGET(req() as never, params({ did: encodeURIComponent(DID.agent) }));
    expectStatus(res, 403);
  });

  it("returns 200 for a global admin regardless of realm membership", async () => {
    asAdmin();
    const res = await agentDetailGET(req() as never, params({ did: encodeURIComponent(DID.agent) }));
    expectStatus(res, 200);
  });
});

describe("PATCH /api/agents/[did] — capabilities", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await agentDetailPATCH(
      req("http://localhost", { capabilities: [] }) as never,
      params({ did: encodeURIComponent(DID.agent) }),
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await agentDetailPATCH(
      req("http://localhost", { capabilities: ["file_access"] }) as never,
      params({ did: encodeURIComponent(DID.agent) }),
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin (not a global admin)", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const res = await agentDetailPATCH(
      req("http://localhost", { capabilities: ["file_access"] }) as never,
      params({ did: encodeURIComponent(DID.agent) }),
    );
    expectStatus(res, 403);
  });

  it("is accessible to global admin (not 401/403)", async () => {
    asAdmin();
    const res = await agentDetailPATCH(
      req("http://localhost", { capabilities: ["file_access"] }) as never,
      params({ did: encodeURIComponent(DID.agent) }),
    );
    // 404 is acceptable here (ws-server is mocked out), but not 401/403
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
    const res = await realmsPOST(req("http://localhost", { name: "X", slug: "x" }) as never);
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmsPOST(req("http://localhost", { name: "X", slug: "x" }) as never);
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin (realm admin ≠ global admin)", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const res = await realmsPOST(req("http://localhost", { name: "X", slug: "x" }) as never);
    expectStatus(res, 403);
  });

  it("is accessible to a global admin", async () => {
    asAdmin();
    const res = await realmsPOST(
      req("http://localhost", { name: "Temp Realm", slug: `tmp-realm-${Date.now()}` }) as never,
    );
    // 201 created or 409 conflict (slug taken) — neither is 401/403
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    // Clean up if it was created
    const body = (res as { _body: { realm?: { id: string } } })._body;
    if (body.realm?.id) {
      getDb().prepare("DELETE FROM realms WHERE id = ?").run(body.realm.id);
    }
  });
});

// --- /api/realms/[id] -------------------------------------------------------

describe("GET /api/realms/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmDetailGET(req() as never, params({ id: testRealmId }));
    expectStatus(res, 401);
  });

  it("returns 200 for a member of the realm", async () => {
    asMember();
    const res = await realmDetailGET(req() as never, params({ id: testRealmId }));
    expectStatus(res, 200);
  });

  it("returns 403 for a stranger", async () => {
    asStranger();
    const res = await realmDetailGET(req() as never, params({ id: testRealmId }));
    expectStatus(res, 403);
  });
});

describe("PATCH /api/realms/[id] — realm metadata", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmDetailPATCH(req("http://localhost", { name: "New Name" }) as never, params({ id: testRealmId }));
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmDetailPATCH(req("http://localhost", { name: "New Name" }) as never, params({ id: testRealmId }));
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin (config is global-admin-only)", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const res = await realmDetailPATCH(req("http://localhost", { name: "New Name" }) as never, params({ id: testRealmId }));
    expectStatus(res, 403);
  });

  it("is accessible to a global admin", async () => {
    asAdmin();
    const res = await realmDetailPATCH(req("http://localhost", { name: "Security Test Realm" }) as never, params({ id: testRealmId }));
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

describe("DELETE /api/realms/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmDetailDELETE(req() as never, params({ id: testRealmId }));
    expectStatus(res, 401);
  });

  it("returns 403 for a realm admin", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const res = await realmDetailDELETE(req() as never, params({ id: testRealmId }));
    expectStatus(res, 403);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmDetailDELETE(req() as never, params({ id: testRealmId }));
    expectStatus(res, 403);
  });
});

// --- /api/realms/[id]/agents ------------------------------------------------

describe("POST /api/realms/[id]/agents", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmAgentsPOST(req("http://localhost", { agentDid: DID.agent }) as never, params({ id: testRealmId }));
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmAgentsPOST(req("http://localhost", { agentDid: DID.agent }) as never, params({ id: testRealmId }));
    expectStatus(res, 403);
  });

  it("returns 403 for a stranger", async () => {
    asStranger();
    const res = await realmAgentsPOST(req("http://localhost", { agentDid: DID.agent }) as never, params({ id: testRealmId }));
    expectStatus(res, 403);
  });

  it("is accessible to a realm admin", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const res = await realmAgentsPOST(req("http://localhost", { agentDid: DID.agent }) as never, params({ id: testRealmId }));
    // 200 ok or 404 agent-not-found — not 401/403
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });

  it("is accessible to a global admin", async () => {
    asAdmin();
    const res = await realmAgentsPOST(req("http://localhost", { agentDid: DID.agent }) as never, params({ id: testRealmId }));
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

describe("DELETE /api/realms/[id]/agents", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmAgentsDELETE(req("http://localhost", { agentDid: DID.agent }) as never, params({ id: testRealmId }));
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmAgentsDELETE(req("http://localhost", { agentDid: DID.agent }) as never, params({ id: testRealmId }));
    expectStatus(res, 403);
  });
});

// --- /api/realms/[id]/users -------------------------------------------------

describe("POST /api/realms/[id]/users", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmUsersPOST(req("http://localhost", { userDid: DID.stranger }) as never, params({ id: testRealmId }));
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmUsersPOST(req("http://localhost", { userDid: DID.stranger }) as never, params({ id: testRealmId }));
    expectStatus(res, 403);
  });

  it("is accessible to a realm admin", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const res = await realmUsersPOST(req("http://localhost", { userDid: DID.stranger }) as never, params({ id: testRealmId }));
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    // Clean up membership added by this test
    getDb().prepare("DELETE FROM user_realms WHERE user_did = ? AND realm_id = ?").run(DID.stranger, testRealmId);
  });
});

describe("PATCH /api/realms/[id]/users — realm admin toggle", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await realmUsersPATCH(
      req("http://localhost", { userDid: DID.member, isRealmAdmin: true }) as never,
      params({ id: testRealmId }),
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmUsersPATCH(
      req("http://localhost", { userDid: DID.member, isRealmAdmin: true }) as never,
      params({ id: testRealmId }),
    );
    expectStatus(res, 403);
  });

  it("is accessible to a realm admin", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const res = await realmUsersPATCH(
      req("http://localhost", { userDid: DID.member, isRealmAdmin: false }) as never,
      params({ id: testRealmId }),
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
      params({ id: testRealmId }),
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await realmUsersDELETE(
      req("http://localhost", { userDid: DID.member }) as never,
      params({ id: testRealmId }),
    );
    expectStatus(res, 403);
  });
});

// --- /api/workflows ---------------------------------------------------------

describe("GET /api/workflows", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workflowsGET(req("http://localhost/api/workflows") as never);
    expectStatus(res, 401);
  });

  it("succeeds for a global admin", async () => {
    asAdmin();
    const res = await workflowsGET(req("http://localhost/api/workflows") as never);
    expectStatus(res, 200);
  });

  it("member receives only their realm's workflows", async () => {
    asMember();
    const res = await workflowsGET(req("http://localhost/api/workflows") as never);
    expectStatus(res, 200);
    const body = (res as { _body: { workflows: { id: string }[] } })._body;
    const ids = body.workflows.map((w) => w.id);
    expect(ids).toContain(testWorkflowId);
  });

  it("stranger receives no workflows", async () => {
    asStranger();
    const res = await workflowsGET(req("http://localhost/api/workflows") as never);
    expectStatus(res, 200);
    const body = (res as { _body: { workflows: unknown[] } })._body;
    expect(body.workflows).toHaveLength(0);
  });
});

describe("POST /api/workflows", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workflowsPOST(
      req("http://localhost", { name: "W", definition: { nodes: [], edges: [] }, realmId: testRealmId }) as never,
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workflowsPOST(
      req("http://localhost", { name: "W", definition: { nodes: [], edges: [] }, realmId: testRealmId }) as never,
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a stranger even for their own realm (they have none)", async () => {
    asStranger();
    const res = await workflowsPOST(
      req("http://localhost", { name: "W", definition: { nodes: [], edges: [] }, realmId: testRealmId }) as never,
    );
    expectStatus(res, 403);
  });

  it("is accessible to a realm admin", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const res = await workflowsPOST(
      req("http://localhost", { name: "Realm Admin WF", definition: { nodes: [], edges: [] }, realmId: testRealmId }) as never,
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    // Clean up
    const body = (res as { _body: { id?: string } })._body;
    if (body.id) getDb().prepare("DELETE FROM workflows WHERE id = ?").run(body.id);
  });

  it("is accessible to a global admin", async () => {
    asAdmin();
    const res = await workflowsPOST(
      req("http://localhost", { name: "Admin WF", definition: { nodes: [], edges: [] }, realmId: testRealmId }) as never,
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
    const body = (res as { _body: { id?: string } })._body;
    if (body.id) getDb().prepare("DELETE FROM workflows WHERE id = ?").run(body.id);
  });
});

// --- /api/workflows/[id] ----------------------------------------------------

describe("GET /api/workflows/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workflowDetailGET(req() as never, params({ id: testWorkflowId }));
    expectStatus(res, 401);
  });

  it("returns 200 for a member of the workflow's realm", async () => {
    asMember();
    const res = await workflowDetailGET(req() as never, params({ id: testWorkflowId }));
    expectStatus(res, 200);
  });

  it("returns 403 for a stranger", async () => {
    asStranger();
    const res = await workflowDetailGET(req() as never, params({ id: testWorkflowId }));
    expectStatus(res, 403);
  });
});

describe("PATCH /api/workflows/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workflowDetailPATCH(
      req("http://localhost", { name: "Updated" }) as never,
      params({ id: testWorkflowId }),
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workflowDetailPATCH(
      req("http://localhost", { name: "Updated" }) as never,
      params({ id: testWorkflowId }),
    );
    expectStatus(res, 403);
  });

  it("is accessible to a realm admin", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const res = await workflowDetailPATCH(
      req("http://localhost", { name: "Realm Admin Update" }) as never,
      params({ id: testWorkflowId }),
    );
    expect(status(res)).not.toBe(401);
    expect(status(res)).not.toBe(403);
  });
});

describe("DELETE /api/workflows/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await workflowDetailDELETE(req() as never, params({ id: testWorkflowId }));
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await workflowDetailDELETE(req() as never, params({ id: testWorkflowId }));
    expectStatus(res, 403);
  });

  it("returns 403 for a stranger", async () => {
    asStranger();
    const res = await workflowDetailDELETE(req() as never, params({ id: testWorkflowId }));
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
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
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
      params({ id: "fake-registration-id" }),
    );
    expectStatus(res, 401);
  });

  it("returns 403 for a regular member", async () => {
    asMember();
    const res = await approveRegistrationPOST(
      req("http://localhost", { capabilities: ["file_access"] }) as never,
      params({ id: "fake-registration-id" }),
    );
    expectStatus(res, 403);
  });

  it("returns 403 for a realm admin", async () => {
    mockGetServerSession.mockResolvedValue(makeSession(DID.realmAdmin));
    const res = await approveRegistrationPOST(
      req("http://localhost", { capabilities: ["file_access"] }) as never,
      params({ id: "fake-registration-id" }),
    );
    expectStatus(res, 403);
  });
});
