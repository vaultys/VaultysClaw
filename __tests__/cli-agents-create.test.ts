/**
 * Tests for POST /api/agents — the agent-provisioning endpoint used by
 * `vaultysclaw agent create`. Mirrors the mocking strategy in models-routes.test.ts.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));
vi.mock("@/lib/ws-server", () => ({
  getWSServer: vi.fn(() => null),
}));

import { prisma } from "../packages/control-plane/db/client";
import { AgentDAO } from "../packages/control-plane/db";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { APIException } from "../packages/control-plane/lib/api/utils/api-utils";
import { NextRequest } from "next/server";
import {
  GET as agentsGET,
  POST as agentsPOST,
} from "../packages/control-plane/app/api/agents/route";

const mockGetAuthContext = getAuthContext as ReturnType<typeof vi.fn>;

function adminCtx() {
  return {
    did: "did:test:admin",
    realmIds: new Set<string>(),
    isOwner: true,
    isGlobalAdmin: true,
    canAccessRealm: async () => true,
    canAdminRealm: async () => true,
    canAccessAgent: async () => true,
    canAdminAgent: async () => true,
  };
}

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    url,
    body !== undefined ? { body } : undefined
  ) as unknown as NextRequest;
}

const T = "did:test:cli-agents:";
const REALM_ID = "test-cli-agents-realm";
const REALM_SLUG = "test-cli-agents";

beforeAll(async () => {
  await prisma.realm.upsert({
    where: { id: REALM_ID },
    create: { id: REALM_ID, name: "CLI Test Realm", slug: REALM_SLUG, color: "#6366f1" },
    update: {},
  });
});

afterAll(async () => {
  await prisma.agentRealm.deleteMany({ where: { realmId: REALM_ID } });
  await prisma.agent.deleteMany({ where: { did: { startsWith: T } } });
  await prisma.realm.deleteMany({ where: { id: REALM_ID } });
});

beforeEach(() => {
  mockGetAuthContext.mockResolvedValue(adminCtx());
});

describe("POST /api/agents", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const res = await agentsPOST(
      req("POST", "http://localhost/api/agents", {
        did: `${T}unauth`,
        name: "x",
      }) as any
    );
    expect(res._status).toBe(401);
  });

  it("provisions an agent and attaches it to the realm", async () => {
    const did = `${T}billing-bot`;
    const res = await agentsPOST(
      req("POST", "http://localhost/api/agents", {
        did,
        name: "billing-bot",
        publicKey: "cHVia2V5",
        realmSlug: REALM_SLUG,
        capabilities: ["read_database"],
      }) as any
    );
    expect(res._status).toBe(201);
    const body = (await res.json()) as { did: string; capabilities: string[] };
    expect(body.did).toBe(did);
    expect(body.capabilities).toEqual(["read_database"]);

    const realms = await AgentDAO.getRealms(did);
    expect(realms.some((r) => r.realmId === REALM_ID)).toBe(true);
  });

  it("returns 404 when the realm slug does not exist", async () => {
    const res = await agentsPOST(
      req("POST", "http://localhost/api/agents", {
        did: `${T}no-realm`,
        name: "x",
        realmSlug: "does-not-exist",
      }) as any
    );
    expect(res._status).toBe(404);
  });

  it("returns 403 for a non-admin lacking realm-admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce({
      ...adminCtx(),
      isGlobalAdmin: false,
      isOwner: false,
      canAdminRealm: async () => false,
    });
    const res = await agentsPOST(
      req("POST", "http://localhost/api/agents", {
        did: `${T}forbidden`,
        name: "x",
        realmSlug: REALM_SLUG,
      }) as any
    );
    expect(res._status).toBe(403);
  });

  it("returns 400 on an invalid body (missing did)", async () => {
    const res = await agentsPOST(
      req("POST", "http://localhost/api/agents", { name: "x" }) as any
    );
    expect(res._status).toBe(400);
  });

  it("upserts on duplicate did (idempotent re-provision)", async () => {
    const did = `${T}dup`;
    const mk = (name: string) =>
      agentsPOST(
        req("POST", "http://localhost/api/agents", { did, name }) as any
      );
    expect((await mk("first"))._status).toBe(201);
    const res2 = await mk("second");
    expect(res2._status).toBe(201);
    const agent = await AgentDAO.findByDid(did);
    expect(agent?.name).toBe("second");
  });

  it("GET still lists agents (sanity)", async () => {
    const res = await agentsGET(
      req("GET", "http://localhost/api/agents") as any
    );
    expect(res._status ?? res.status).toBe(200);
  });
});
