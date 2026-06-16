/**
 * Route-handler tests for /api/api-keys and /api/api-keys/[id].
 *
 * Tests:
 *   - 401 when unauthenticated
 *   - 403 when non-admin
 *   - Input validation (POST / PATCH)
 *   - Happy-path CRUD: create, list, update, deactivate, delete
 *   - Raw key returned only on creation (not in list)
 *   - Key uniqueness across calls
 *   - 404 for unknown IDs
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
// Mocks — declared before any import that uses them
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
  unauthorized: () => ({ _body: { error: "Not authenticated" }, _status: 401, async json() { return { error: "Not authenticated" }; } }),
  forbidden:     () => ({ _body: { error: "Forbidden" },         _status: 403, async json() { return { error: "Forbidden" };         } }),
  notFound:  (msg?: string) => ({ _body: { error: msg ?? "Not found" }, _status: 404, async json() { return { error: msg ?? "Not found" }; } }),
  malformed: (msg?: string) => ({ _body: { error: msg ?? "Bad request" }, _status: 400, async json() { return { error: msg ?? "Bad request" }; } }),
}));

vi.mock("@/lib/ws-server", () => ({ getWSServer: vi.fn(() => null) }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { APIException } from "../packages/control-plane/lib/api/utils/api-utils";
import { prisma } from "../packages/control-plane/db/client";

import { GET as listKeys, POST as createKey } from "../packages/control-plane/app/api/api-keys/route";
import {
  PATCH as updateKey,
  DELETE as deleteKey,
} from "../packages/control-plane/app/api/api-keys/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetAuthContext = getAuthContext as ReturnType<typeof vi.fn>;

function asAdmin(did = "did:vaultys:admin-apikeys-001") {
  mockGetAuthContext.mockResolvedValue({
    did,
    isOwner: true,
    isGlobalAdmin: true,
    realmIds: new Set<string>(),
    canAccessRealm: async () => true,
    canAdminRealm:  async () => true,
    canAccessAgent: async () => true,
    canAdminAgent:  async () => true,
  });
}

function asMember(did = "did:vaultys:member-apikeys-001") {
  mockGetAuthContext.mockResolvedValue({
    did,
    isOwner: false,
    isGlobalAdmin: false,
    realmIds: new Set<string>(),
    canAccessRealm: async () => false,
    canAdminRealm:  async () => false,
    canAccessAgent: async () => false,
    canAdminAgent:  async () => false,
  });
}

function asUnauthenticated() {
  mockGetAuthContext.mockRejectedValue(new APIException("UNAUTHORIZED"));
}

class MockRequest {
  url: string;
  method: string;
  nextUrl: { searchParams: URLSearchParams };
  private _body: unknown;
  headers: { get: () => null };

  constructor(url = "http://localhost/api/api-keys", body?: unknown, method = "GET") {
    this.url = url;
    this.method = method;
    this.nextUrl = { searchParams: new URL(url).searchParams };
    this._body = body ?? {};
    this.headers = { get: () => null };
  }

  async json() {
    return this._body;
  }
}

function req(url?: string, body?: unknown, method = "GET") {
  return new MockRequest(url, body, method) as unknown as Request;
}

function params(p: Record<string, string>) {
  return { params: Promise.resolve(p) };
}

function expectStatus(r: unknown, status: number) {
  expect((r as { _status: number })._status).toBe(status);
}

const SENTINEL = "apikeys-test-001";

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await prisma.apiKey.deleteMany({ where: { name: { contains: SENTINEL } } });
});

afterAll(async () => {
  await prisma.apiKey.deleteMany({ where: { name: { contains: SENTINEL } } });
});

beforeEach(() => {
  mockGetAuthContext.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/api-keys — list
// ---------------------------------------------------------------------------

describe("GET /api/api-keys", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await listKeys(req());
    expectStatus(res, 401);
  });

  it("returns 403 when non-admin", async () => {
    asMember();
    const res = await listKeys(req());
    expectStatus(res, 403);
  });

  it("returns 200 with apiKeys array for admin", async () => {
    asAdmin();
    const res = await listKeys(req());
    expectStatus(res, 200);
    const body = await res.json();
    expect(Array.isArray(body.apiKeys)).toBe(true);
  });

  it("does NOT expose keyHash in the list response", async () => {
    asAdmin();
    const res = await listKeys(req());
    const body = await res.json();
    for (const k of body.apiKeys as Record<string, unknown>[]) {
      expect(k).not.toHaveProperty("keyHash");
    }
  });

  it("does NOT expose the raw key in the list response", async () => {
    asAdmin();
    const res = await listKeys(req());
    const body = await res.json();
    for (const k of body.apiKeys as Record<string, unknown>[]) {
      expect(k).not.toHaveProperty("key");
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/api-keys — create
// ---------------------------------------------------------------------------

describe("POST /api/api-keys", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await createKey(req("http://localhost/api/api-keys", {}, "POST"));
    expectStatus(res, 401);
  });

  it("returns 403 when non-admin", async () => {
    asMember();
    const res = await createKey(req("http://localhost/api/api-keys", { name: `${SENTINEL}-x`, allowedRoutes: ["GET /api/agents"] }, "POST"));
    expectStatus(res, 403);
  });

  it("returns 400 when name is missing", async () => {
    asAdmin();
    const res = await createKey(req("http://localhost/api/api-keys", { allowedRoutes: ["GET /api/agents"] }, "POST"));
    expectStatus(res, 400);
  });

  it("returns 400 when name is empty string", async () => {
    asAdmin();
    const res = await createKey(req("http://localhost/api/api-keys", { name: "  ", allowedRoutes: ["GET /api/agents"] }, "POST"));
    expectStatus(res, 400);
  });

  it("returns 400 when allowedRoutes is missing", async () => {
    asAdmin();
    const res = await createKey(req("http://localhost/api/api-keys", { name: `${SENTINEL}-no-routes` }, "POST"));
    expectStatus(res, 400);
  });

  it("returns 400 when allowedRoutes is an empty array", async () => {
    asAdmin();
    const res = await createKey(req("http://localhost/api/api-keys", { name: `${SENTINEL}-empty-routes`, allowedRoutes: [] }, "POST"));
    expectStatus(res, 400);
  });

  it("returns 201 with apiKey and raw key on success", async () => {
    asAdmin();
    const res = await createKey(
      req("http://localhost/api/api-keys", {
        name: `${SENTINEL}-create-ok`,
        allowedRoutes: ["GET /api/agents"],
      }, "POST")
    );
    expectStatus(res, 201);
    const body = await res.json();
    expect(body.apiKey).toBeDefined();
    expect(typeof body.key).toBe("string");
    expect(body.key).toMatch(/^vc_key_/);
  });

  it("raw key starts with vc_key_ and matches the stored prefix", async () => {
    asAdmin();
    const res = await createKey(
      req("http://localhost/api/api-keys", {
        name: `${SENTINEL}-prefix-check`,
        allowedRoutes: ["GET /api/agents"],
      }, "POST")
    );
    const body = await res.json();
    expect(body.key.startsWith(body.apiKey.keyPrefix)).toBe(true);
  });

  it("two POST calls produce distinct keys", async () => {
    asAdmin();
    const bodyA = await (await createKey(req("http://localhost/api/api-keys", { name: `${SENTINEL}-uniq-a`, allowedRoutes: ["GET /api/agents"] }, "POST"))).json();
    asAdmin();
    const bodyB = await (await createKey(req("http://localhost/api/api-keys", { name: `${SENTINEL}-uniq-b`, allowedRoutes: ["GET /api/agents"] }, "POST"))).json();
    expect(bodyA.key).not.toBe(bodyB.key);
    expect(bodyA.apiKey.id).not.toBe(bodyB.apiKey.id);
  });

  it("created key appears in the list", async () => {
    asAdmin();
    const created = await (await createKey(req("http://localhost/api/api-keys", { name: `${SENTINEL}-appears-in-list`, allowedRoutes: ["GET /api/agents"] }, "POST"))).json();

    asAdmin();
    const list = await (await listKeys(req())).json();
    const found = (list.apiKeys as { id: string }[]).find(k => k.id === created.apiKey.id);
    expect(found).toBeDefined();
  });

  it("creates a realm-scoped key when realmId is provided", async () => {
    asAdmin();
    const res = await createKey(
      req("http://localhost/api/api-keys", {
        name: `${SENTINEL}-realm-scoped`,
        allowedRoutes: ["GET /api/agents"],
        realmId: "realm-test-scope",
      }, "POST")
    );
    const body = await res.json();
    expect(body.apiKey.realmId).toBe("realm-test-scope");
  });

  it("creates a global key when realmId is null", async () => {
    asAdmin();
    const res = await createKey(
      req("http://localhost/api/api-keys", {
        name: `${SENTINEL}-global`,
        allowedRoutes: ["GET /api/agents"],
        realmId: null,
      }, "POST")
    );
    const body = await res.json();
    expect(body.apiKey.realmId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/api-keys/[id] — update
// ---------------------------------------------------------------------------

describe("PATCH /api/api-keys/[id]", () => {
  let keyId: string;

  beforeAll(async () => {
    // Create a test key to update
    asAdmin();
    const res = await createKey(
      req("http://localhost/api/api-keys", {
        name: `${SENTINEL}-patch-target`,
        allowedRoutes: ["GET /api/agents"],
      }, "POST")
    );
    const body = await res.json();
    keyId = body.apiKey.id;
  });

  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await updateKey(req("http://localhost/api/api-keys/" + keyId, { name: "x" }, "PATCH"), params({ id: keyId }));
    expectStatus(res, 401);
  });

  it("returns 403 when non-admin", async () => {
    asMember();
    const res = await updateKey(req("http://localhost/api/api-keys/" + keyId, { name: "x" }, "PATCH"), params({ id: keyId }));
    expectStatus(res, 403);
  });

  it("returns 404 for unknown id", async () => {
    asAdmin();
    const res = await updateKey(req("http://localhost/api/api-keys/no-such-id", { name: "x" }, "PATCH"), params({ id: "no-such-id" }));
    expectStatus(res, 404);
  });

  it("returns 400 when name is empty string", async () => {
    asAdmin();
    const res = await updateKey(req("http://localhost/api/api-keys/" + keyId, { name: "" }, "PATCH"), params({ id: keyId }));
    expectStatus(res, 400);
  });

  it("returns 400 when allowedRoutes is empty array", async () => {
    asAdmin();
    const res = await updateKey(req("http://localhost/api/api-keys/" + keyId, { allowedRoutes: [] }, "PATCH"), params({ id: keyId }));
    expectStatus(res, 400);
  });

  it("returns 400 when body has no updatable fields", async () => {
    asAdmin();
    const res = await updateKey(req("http://localhost/api/api-keys/" + keyId, {}, "PATCH"), params({ id: keyId }));
    expectStatus(res, 400);
  });

  it("updates name successfully", async () => {
    asAdmin();
    const res = await updateKey(
      req("http://localhost/api/api-keys/" + keyId, { name: `${SENTINEL}-renamed` }, "PATCH"),
      params({ id: keyId })
    );
    expectStatus(res, 200);
    const body = await res.json();
    expect(body.name).toBe(`${SENTINEL}-renamed`);
  });

  it("updates allowedRoutes successfully", async () => {
    asAdmin();
    const newRoutes = ["GET /api/workflows", "POST /api/workflows"];
    const res = await updateKey(
      req("http://localhost/api/api-keys/" + keyId, { allowedRoutes: newRoutes }, "PATCH"),
      params({ id: keyId })
    );
    expectStatus(res, 200);
    const body = await res.json();
    expect(body.allowedRoutes).toEqual(newRoutes);
  });

  it("deactivates a key via isActive: false", async () => {
    asAdmin();
    const res = await updateKey(
      req("http://localhost/api/api-keys/" + keyId, { isActive: false }, "PATCH"),
      params({ id: keyId })
    );
    expectStatus(res, 200);
    const body = await res.json();
    expect(body.isActive).toBe(false);
  });

  it("re-activates a key via isActive: true", async () => {
    asAdmin();
    const res = await updateKey(
      req("http://localhost/api/api-keys/" + keyId, { isActive: true }, "PATCH"),
      params({ id: keyId })
    );
    expectStatus(res, 200);
    const body = await res.json();
    expect(body.isActive).toBe(true);
  });

  it("sets an expiry date", async () => {
    asAdmin();
    const futureUnix = Math.floor(Date.now() / 1000) + 3600;
    const res = await updateKey(
      req("http://localhost/api/api-keys/" + keyId, { expiresAt: futureUnix }, "PATCH"),
      params({ id: keyId })
    );
    expectStatus(res, 200);
    const body = await res.json();
    expect(body.expiresAt).toBe(futureUnix);
  });

  it("clears expiry when expiresAt is null", async () => {
    asAdmin();
    const res = await updateKey(
      req("http://localhost/api/api-keys/" + keyId, { expiresAt: null }, "PATCH"),
      params({ id: keyId })
    );
    expectStatus(res, 200);
    const body = await res.json();
    expect(body.expiresAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/api-keys/[id] — delete
// ---------------------------------------------------------------------------

describe("DELETE /api/api-keys/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    asUnauthenticated();
    const res = await deleteKey(req("http://localhost/api/api-keys/some-id", undefined, "DELETE"), params({ id: "some-id" }));
    expectStatus(res, 401);
  });

  it("returns 403 when non-admin", async () => {
    asMember();
    const res = await deleteKey(req("http://localhost/api/api-keys/some-id", undefined, "DELETE"), params({ id: "some-id" }));
    expectStatus(res, 403);
  });

  it("returns 404 for unknown id", async () => {
    asAdmin();
    const res = await deleteKey(req("http://localhost/api/api-keys/no-such-id", undefined, "DELETE"), params({ id: "no-such-id" }));
    expectStatus(res, 404);
  });

  it("returns 204 and removes the key", async () => {
    // Create a key to delete
    asAdmin();
    const created = await (await createKey(
      req("http://localhost/api/api-keys", { name: `${SENTINEL}-to-delete`, allowedRoutes: ["GET /api/agents"] }, "POST")
    )).json();
    const id = created.apiKey.id;

    asAdmin();
    const delRes = await deleteKey(req(`http://localhost/api/api-keys/${id}`, undefined, "DELETE"), params({ id }));
    expectStatus(delRes, 204);

    // Key should be gone — second delete returns 404
    asAdmin();
    const delAgain = await deleteKey(req(`http://localhost/api/api-keys/${id}`, undefined, "DELETE"), params({ id }));
    expectStatus(delAgain, 404);
  });

  it("deleted key no longer appears in the list", async () => {
    asAdmin();
    const created = await (await createKey(
      req("http://localhost/api/api-keys", { name: `${SENTINEL}-list-gone`, allowedRoutes: ["GET /api/agents"] }, "POST")
    )).json();
    const id = created.apiKey.id;

    asAdmin();
    await deleteKey(req(`http://localhost/api/api-keys/${id}`, undefined, "DELETE"), params({ id }));

    asAdmin();
    const list = await (await listKeys(req())).json();
    const found = (list.apiKeys as { id: string }[]).find(k => k.id === id);
    expect(found).toBeUndefined();
  });
});
