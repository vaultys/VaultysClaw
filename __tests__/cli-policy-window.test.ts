/**
 * Tests that `policy grant --window` persists a structured time window in the
 * policy's resourceLimits and triggers the signed cert push (applyPolicy).
 */

import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";

vi.mock("@/lib/auth-utils", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/ws-server", () => ({ getWSServer: vi.fn() }));

import { prisma } from "../packages/control-plane/db/client";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { getWSServer } from "../packages/control-plane/lib/ws-server";
import { NextRequest } from "next/server";
import { POST as policiesPOST } from "../packages/control-plane/app/api/policies/route";

const mockAuthCtx = getAuthContext as ReturnType<typeof vi.fn>;
const mockWsServer = getWSServer as ReturnType<typeof vi.fn>;

const AGENT_DID = "did:test:cli-policy:billing-bot";

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    url,
    body !== undefined ? { body } : undefined
  ) as unknown as NextRequest;
}

function adminCtx() {
  return { did: "did:test:admin", isGlobalAdmin: true, isOwner: true };
}

afterAll(async () => {
  await prisma.policy.deleteMany({ where: { agentDid: AGENT_DID } });
});

beforeEach(() => {
  mockAuthCtx.mockResolvedValue(adminCtx());
});

describe("POST /api/policies with a time window", () => {
  it("persists resourceLimits.timeWindow and pushes via applyPolicy", async () => {
    const applyPolicy = vi.fn(async () => true);
    mockWsServer.mockReturnValue({ applyPolicy });

    const timeWindow = {
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      start: "09:00",
      end: "17:00",
    };
    const res = await policiesPOST(
      req("POST", "http://localhost/api/policies", {
        agentDid: AGENT_DID,
        capabilities: ["read_database"],
        resourceLimits: { timeWindow },
      }) as any
    );
    expect(res._status).toBe(201);
    const body = (await res.json()) as {
      policy: { id: string; resourceLimits: { timeWindow?: unknown } | null };
      sentTo: string[];
    };
    expect(body.policy.resourceLimits?.timeWindow).toEqual(timeWindow);
    expect(body.sentTo).toEqual([AGENT_DID]);
    expect(applyPolicy).toHaveBeenCalledOnce();

    // Confirm it is durably stored.
    const row = await prisma.policy.findUnique({ where: { id: body.policy.id } });
    expect((row!.resourceLimits as { timeWindow: unknown }).timeWindow).toEqual(
      timeWindow
    );
  });

  it("returns 403 for non-admins", async () => {
    mockAuthCtx.mockResolvedValueOnce({
      ...adminCtx(),
      isGlobalAdmin: false,
      isOwner: false,
    });
    const res = await policiesPOST(
      req("POST", "http://localhost/api/policies", {
        agentDid: AGENT_DID,
        capabilities: ["read_database"],
      }) as any
    );
    expect(res._status).toBe(403);
  });

  it("returns 400 when capabilities is empty", async () => {
    mockWsServer.mockReturnValue({ applyPolicy: vi.fn() });
    const res = await policiesPOST(
      req("POST", "http://localhost/api/policies", {
        agentDid: AGENT_DID,
        capabilities: [],
      }) as any
    );
    expect(res._status).toBe(400);
  });
});
