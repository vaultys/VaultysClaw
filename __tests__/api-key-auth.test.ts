/**
 * Integration tests for the API key authentication path in getAuthContext().
 *
 * These tests use a real database (Docker Postgres from global-setup) to verify
 * the complete flow:
 *   generate key → store hash → authenticate via x-api-key header → permission checks
 *
 * next-auth's getServerSession is mocked to return null so the code falls
 * through to the API key branch.
 *
 * Covers:
 *   - Valid key is accepted
 *   - Unknown key is rejected (401)
 *   - Inactive key is rejected (401)
 *   - Expired key is rejected (401)
 *   - Key without route permission is rejected (403)
 *   - Workspace-scoped key cannot access other workspaces
 *   - Global key (workspaceId=null) can access any workspace
 *   - lastUsedAt is updated on successful auth
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// ---------------------------------------------------------------------------
// Mock next-auth so getServerSession always returns null
// (forces getAuthContext to fall through to API key branch).
// next/headers is aliased globally in vitest.config.mjs to avoid the
// "headers called outside request scope" error from Next.js AsyncLocalStorage.
// ---------------------------------------------------------------------------
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue(null),
}));

vi.mock("../packages/control-plane/lib/auth-config", () => ({
  authOptions: {},
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { APIException } from "../packages/control-plane/lib/api/utils/api-utils";
import { generateApiKey } from "../packages/control-plane/lib/api/utils/api-key-utils";
import { ApiKeyDAO } from "../packages/control-plane/db/api-key.dao";
import { AgentDAO } from "../packages/control-plane/db/agent.dao";
import { WorkspaceDAO } from "../packages/control-plane/db/workspace.dao";
import { prisma } from "../packages/control-plane/db/client";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SENTINEL = "akauth-test-001";

function makeRequest(
  path: string,
  method = "GET",
  apiKey?: string,
  authHeader?: string
): Request {
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;
  if (authHeader) headers["authorization"] = authHeader;
  return new Request(`http://localhost${path}`, { method, headers });
}

async function createTestKey(opts: {
  allowedRoutes: string[];
  workspaceId?: string | null;
  isWorkspaceAdmin?: boolean;
  isActive?: boolean;
  expiresAt?: Date;
}): Promise<{ key: string; id: string }> {
  const { key, hash, prefix } = generateApiKey();
  const id = crypto.randomUUID();
  await ApiKeyDAO.create({
    id,
    name: `${SENTINEL}-key-${id.slice(0, 8)}`,
    keyHash: hash,
    keyPrefix: prefix,
    allowedRoutes: opts.allowedRoutes,
    workspaceId: opts.workspaceId ?? undefined,
    isWorkspaceAdmin: opts.isWorkspaceAdmin,
    createdBy: `did:vaultys:${SENTINEL}`,
    ...(opts.isActive === false ? {} : {}), // default isActive=true
    ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
  });

  // Override isActive if needed (DAO doesn't expose isActive on create)
  if (opts.isActive === false) {
    await prisma.apiKey.update({ where: { id }, data: { isActive: false } });
  }

  return { key, id };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let testWorkspaceId: string;
let otherWorkspaceId: string;
let testAgentDid: string;

beforeAll(async () => {
  testWorkspaceId = `workspace-${SENTINEL}`;
  otherWorkspaceId = `workspace-other-${SENTINEL}`;
  testAgentDid = `did:vaultys:agent-${SENTINEL}`;

  await prisma.workspace.upsert({
    where: { id: testWorkspaceId },
    create: { id: testWorkspaceId, name: "AK Auth Test Workspace", slug: `ak-auth-test-${SENTINEL}`, color: "#000" },
    update: {},
  });
  await prisma.workspace.upsert({
    where: { id: otherWorkspaceId },
    create: { id: otherWorkspaceId, name: "AK Auth Other Workspace", slug: `ak-auth-other-${SENTINEL}`, color: "#111" },
    update: {},
  });
  await prisma.agent.upsert({
    where: { did: testAgentDid },
    create: { did: testAgentDid, name: `agent-${SENTINEL}`, capabilities: [] },
    update: {},
  });
  await prisma.agentWorkspace.upsert({
    where: { agentDid_workspaceId: { agentDid: testAgentDid, workspaceId: testWorkspaceId } },
    create: { agentDid: testAgentDid, workspaceId: testWorkspaceId },
    update: {},
  });
});

afterAll(async () => {
  await prisma.apiKey.deleteMany({ where: { name: { contains: SENTINEL } } });
  await prisma.agentWorkspace.deleteMany({ where: { workspaceId: { contains: SENTINEL } } });
  await prisma.agent.deleteMany({ where: { did: { contains: SENTINEL } } });
  await prisma.workspace.deleteMany({ where: { id: { contains: SENTINEL } } });
});

// ---------------------------------------------------------------------------
// Valid key authentication
// ---------------------------------------------------------------------------

describe("API key auth — valid key", () => {
  it("authenticates successfully with x-api-key header", async () => {
    const { key } = await createTestKey({ allowedRoutes: ["GET /api/agents"] });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(ctx.did).toMatch(/^apikey:/);
  });

  it("authenticates successfully with Bearer Authorization header", async () => {
    const { key } = await createTestKey({ allowedRoutes: ["GET /api/agents"] });
    const ctx = await getAuthContext(
      makeRequest("/api/agents", "GET", undefined, `Bearer ${key}`)
    );
    expect(ctx.did).toMatch(/^apikey:/);
  });

  it("returns isGlobalAdmin=false for a workspace-scoped key", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      workspaceId: testWorkspaceId,
    });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(ctx.isGlobalAdmin).toBe(false);
  });

  it("returns isGlobalAdmin=true for a global key (workspaceId=null)", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      workspaceId: null,
    });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(ctx.isGlobalAdmin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rejected keys
// ---------------------------------------------------------------------------

describe("API key auth — rejected keys", () => {
  it("throws UNAUTHORIZED for an unknown key", async () => {
    const { key: _unused } = generateApiKey();
    const fakeKey = generateApiKey().key; // not stored in DB
    await expect(
      getAuthContext(makeRequest("/api/agents", "GET", fakeKey))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED for an inactive key", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      isActive: false,
    });
    await expect(
      getAuthContext(makeRequest("/api/agents", "GET", key))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED for an expired key", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      expiresAt: new Date(Date.now() - 1_000), // 1 second ago
    });
    await expect(
      getAuthContext(makeRequest("/api/agents", "GET", key))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does NOT throw for a key that has not yet expired", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      expiresAt: new Date(Date.now() + 3_600_000), // +1 h
    });
    await expect(
      getAuthContext(makeRequest("/api/agents", "GET", key))
    ).resolves.not.toThrow();
  });

  it("throws UNAUTHORIZED when no key is provided", async () => {
    await expect(
      getAuthContext(makeRequest("/api/agents", "GET"))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ---------------------------------------------------------------------------
// Route permission checks
// ---------------------------------------------------------------------------

describe("API key auth — route permission (matchRoute integration)", () => {
  it("throws FORBIDDEN when route is not in allowedRoutes", async () => {
    const { key } = await createTestKey({ allowedRoutes: ["GET /api/workflows"] });
    await expect(
      getAuthContext(makeRequest("/api/agents", "GET", key))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when method doesn't match", async () => {
    const { key } = await createTestKey({ allowedRoutes: ["GET /api/agents"] });
    await expect(
      getAuthContext(makeRequest("/api/agents", "POST", key))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows access when route matches allowedRoutes", async () => {
    const { key } = await createTestKey({ allowedRoutes: ["GET /api/agents/[did]"] });
    const ctx = await getAuthContext(makeRequest("/api/agents/did:vaultys:abc", "GET", key));
    expect(ctx).toBeDefined();
  });

  it("allows access to sub-paths of an allowed route", async () => {
    const { key } = await createTestKey({ allowedRoutes: ["GET /api/agents"] });
    // /api/agents/did:vaultys:abc is a sub-path of /api/agents
    const ctx = await getAuthContext(makeRequest("/api/agents/did:vaultys:abc", "GET", key));
    expect(ctx).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Workspace scope isolation
// ---------------------------------------------------------------------------

describe("API key auth — workspace scope isolation", () => {
  it("canAccessWorkspace returns true for the key's own workspace", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      workspaceId: testWorkspaceId,
    });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(await ctx.canAccessWorkspace(testWorkspaceId)).toBe(true);
  });

  it("canAccessWorkspace returns false for a different workspace", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      workspaceId: testWorkspaceId,
    });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(await ctx.canAccessWorkspace(otherWorkspaceId)).toBe(false);
  });

  it("global key canAccessWorkspace returns true for any workspace", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      workspaceId: null,
    });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(await ctx.canAccessWorkspace(testWorkspaceId)).toBe(true);
    expect(await ctx.canAccessWorkspace(otherWorkspaceId)).toBe(true);
    expect(await ctx.canAccessWorkspace("any-workspace-id")).toBe(true);
  });

  it("canAdminWorkspace returns false for non-admin workspace-scoped key", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      workspaceId: testWorkspaceId,
      isWorkspaceAdmin: false,
    });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(await ctx.canAdminWorkspace(testWorkspaceId)).toBe(false);
  });

  it("canAdminWorkspace returns true for workspace-admin key on its workspace", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      workspaceId: testWorkspaceId,
      isWorkspaceAdmin: true,
    });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(await ctx.canAdminWorkspace(testWorkspaceId)).toBe(true);
  });

  it("canAdminWorkspace returns false even for admin key on a different workspace", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      workspaceId: testWorkspaceId,
      isWorkspaceAdmin: true,
    });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(await ctx.canAdminWorkspace(otherWorkspaceId)).toBe(false);
  });

  it("canAccessAgent returns true when agent is in key's workspace", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      workspaceId: testWorkspaceId,
    });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(await ctx.canAccessAgent(testAgentDid)).toBe(true);
  });

  it("canAccessAgent returns false when agent is in a different workspace", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      workspaceId: otherWorkspaceId,
    });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(await ctx.canAccessAgent(testAgentDid)).toBe(false);
  });

  it("global key canAccessAgent returns true for any agent", async () => {
    const { key } = await createTestKey({
      allowedRoutes: ["GET /api/agents"],
      workspaceId: null,
    });
    const ctx = await getAuthContext(makeRequest("/api/agents", "GET", key));
    expect(await ctx.canAccessAgent(testAgentDid)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// lastUsedAt update
// ---------------------------------------------------------------------------

describe("API key auth — lastUsedAt tracking", () => {
  it("updates lastUsedAt after successful authentication", async () => {
    const { key, id } = await createTestKey({ allowedRoutes: ["GET /api/agents"] });

    // Before: lastUsedAt should be null
    const before = await ApiKeyDAO.findById(id);
    expect(before?.lastUsedAt).toBeNull();

    await getAuthContext(makeRequest("/api/agents", "GET", key));

    // Allow the fire-and-forget update to complete
    await new Promise((r) => setTimeout(r, 100));

    const after = await ApiKeyDAO.findById(id);
    expect(after?.lastUsedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Public routes bypass
// ---------------------------------------------------------------------------

describe("API key auth — public routes", () => {
  it("throws UNAUTHORIZED for public routes even without a key (no bypass)", async () => {
    // isPublicRoute returns true → getAuthContext throws UNAUTHORIZED immediately
    // (public routes are handled by the route themselves without auth context)
    await expect(
      getAuthContext(makeRequest("/api/public/health", "GET"))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
