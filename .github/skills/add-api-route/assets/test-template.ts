/**
 * Test template for a control-plane API route.
 * File: __tests__/<resource>-routes.test.ts
 *
 * Replace <resource>, <Resource>, and adjust imports.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/<resource>/route";
import * as authUtils from "@/lib/auth-utils";

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
  unauthorized: vi.fn(
    () =>
      new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
      })
  ),
  forbidden: vi.fn(
    () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
  ),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      get: vi.fn(() => ({ total: 0 })),
      run: vi.fn(() => ({ changes: 1 })),
    })),
  })),
}));

const mockAdminAuth = {
  did: "did:test:admin",
  isOwner: true,
  isGlobalAdmin: true,
  canAccessRealm: () => true,
  canAdminRealm: () => true,
  canAccessAgent: () => true,
  canAdminAgent: () => true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET (list) ─────────────────────────────────────────────────────────────

describe("GET /api/<resource>", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(authUtils.getAuthContext).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/<resource>"));
    expect(authUtils.unauthorized).toHaveBeenCalled();
  });

  it("returns paginated list for authenticated user", async () => {
    vi.mocked(authUtils.getAuthContext).mockResolvedValue(mockAdminAuth);
    const res = await GET(
      new Request("http://localhost/api/<resource>?page=1&pageSize=10")
    );
    const data = await res.json();
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("page", 1);
    expect(data).toHaveProperty("pageSize", 10);
  });
});

// ─── POST (create) ──────────────────────────────────────────────────────────

describe("POST /api/<resource>", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(authUtils.getAuthContext).mockResolvedValue(null);
    await POST(
      new Request("http://localhost/api/<resource>", {
        method: "POST",
        body: JSON.stringify({ name: "test" }),
      })
    );
    expect(authUtils.unauthorized).toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    vi.mocked(authUtils.getAuthContext).mockResolvedValue(mockAdminAuth);
    const res = await POST(
      new Request("http://localhost/api/<resource>", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/name/i);
  });

  it("creates resource and returns 201", async () => {
    vi.mocked(authUtils.getAuthContext).mockResolvedValue(mockAdminAuth);
    const res = await POST(
      new Request("http://localhost/api/<resource>", {
        method: "POST",
        body: JSON.stringify({ name: "My <Resource>" }),
      })
    );
    expect(res.status).toBe(201);
  });
});
