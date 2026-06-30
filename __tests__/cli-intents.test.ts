/**
 * Tests for the deny-by-default policy decision point + signed audit trail:
 *   POST /api/intents  → ALLOW / DENY, signed and persisted
 *   GET  /api/intents  → exposes decision / signature / verified
 *
 * Uses the real (ephemeral) DB so signIntent/verifyIntentSignature run against
 * the seeded serverSecret. next-auth + ws-server + auth-utils are mocked.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth-config", () => ({ authOptions: {} }));
vi.mock("@/lib/auth-utils", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/ws-server", () => ({ getWSServer: vi.fn(() => null) }));

import { getServerSession } from "next-auth";
import { prisma } from "../packages/control-plane/db/client";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { getWSServer } from "../packages/control-plane/lib/ws-server";
import { NextRequest } from "next/server";
import {
  POST as intentsPOST,
  GET as intentsGET,
} from "../packages/control-plane/app/api/intents/route";

const mockSession = getServerSession as ReturnType<typeof vi.fn>;
const mockAuthCtx = getAuthContext as ReturnType<typeof vi.fn>;
const mockWsServer = getWSServer as ReturnType<typeof vi.fn>;

const AGENT_DID = "did:test:cli-intents:billing-bot";

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    url,
    body !== undefined ? { body } : undefined
  ) as unknown as NextRequest;
}

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

beforeAll(async () => {
  await prisma.agent.upsert({
    where: { did: AGENT_DID },
    create: {
      did: AGENT_DID,
      name: "billing-bot",
      capabilities: ["read_database"],
    },
    update: { capabilities: ["read_database"] },
  });
});

afterAll(async () => {
  await prisma.intentLog.deleteMany({ where: { agentDid: AGENT_DID } });
  await prisma.agent.deleteMany({ where: { did: AGENT_DID } });
});

const DEVICE_DID = "did:test:cli-intents:device";

beforeEach(() => {
  mockSession.mockResolvedValue({
    user: { isAdmin: true, did: "did:test:admin", deviceDid: DEVICE_DID },
  });
  mockAuthCtx.mockResolvedValue(adminCtx());
  mockWsServer.mockReturnValue(null);
});

describe("POST /api/intents — deny-by-default", () => {
  it("DENIES an action the agent has no capability for, and audits it (signed)", async () => {
    const res = await intentsPOST(
      req("POST", "http://localhost/api/intents", {
        agentId: AGENT_DID,
        action: "delete_database",
      }) as any
    );
    expect(res._status).toBe(403);
    const body = (await res.json()) as {
      intentId: string;
      decision: string;
      reason: string;
    };
    expect(body.decision).toBe("DENY");
    expect(body.reason).toContain('no capability "delete_database"');

    const row = await prisma.intentLog.findUnique({
      where: { intentId: body.intentId },
    });
    expect(row).not.toBeNull();
    expect(row!.decision).toBe("DENY");
    expect(row!.action).toBe("delete_database");
    expect(row!.agentDid).toBe(AGENT_DID);
    expect(row!.signature).toBeTruthy();
    // The initiating device is recorded for per-device audit.
    expect(row!.initiatorDid).toBe(DEVICE_DID);
  });

  it("ALLOWS a granted action and records the decision (agent offline)", async () => {
    const res = await intentsPOST(
      req("POST", "http://localhost/api/intents", {
        agentId: AGENT_DID,
        action: "read_database",
      }) as any
    );
    expect(res._status).toBe(202);
    const body = (await res.json()) as {
      intentId: string;
      decision: string;
      sentTo: string[];
    };
    expect(body.decision).toBe("ALLOW");
    expect(body.sentTo).toEqual([]); // ws server null → not dispatched

    const row = await prisma.intentLog.findUnique({
      where: { intentId: body.intentId },
    });
    expect(row!.decision).toBe("ALLOW");
    expect(row!.signature).toBeTruthy();
  });

  it("ALLOWS and dispatches when the agent is connected", async () => {
    const send = vi.fn(async () => true);
    mockWsServer.mockReturnValue({ sendIntentToAgent: send });
    const res = await intentsPOST(
      req("POST", "http://localhost/api/intents", {
        agentId: AGENT_DID,
        action: "read_database",
      }) as any
    );
    expect(res._status).toBe(202);
    const body = (await res.json()) as { sentTo: string[] };
    expect(body.sentTo).toEqual([AGENT_DID]);
    expect(send).toHaveBeenCalledOnce();
  });

  it("returns 404 for an unknown agent", async () => {
    const res = await intentsPOST(
      req("POST", "http://localhost/api/intents", {
        agentId: "did:test:nope",
        action: "read_database",
      }) as any
    );
    expect(res._status).toBe(404);
  });
});

describe("GET /api/intents — signed audit trail", () => {
  it("returns decision + signature + verified:true for a signed record", async () => {
    // Create a fresh DENY record.
    const post = await intentsPOST(
      req("POST", "http://localhost/api/intents", {
        agentId: AGENT_DID,
        action: "drop_table",
      }) as any
    );
    const { intentId } = (await post.json()) as { intentId: string };

    const res = await intentsGET(
      req(
        "GET",
        `http://localhost/api/intents?agentDid=${AGENT_DID}&last=20`
      ) as any
    );
    expect(res._status ?? res.status).toBe(200);
    const body = (await res.json()) as {
      intents: Array<{
        intentId: string;
        decision: string | null;
        signature: string | null;
        verified: boolean;
        action: string;
      }>;
    };
    const rec = body.intents.find((i) => i.intentId === intentId);
    expect(rec).toBeDefined();
    expect(rec!.decision).toBe("DENY");
    expect(rec!.signature).toBeTruthy();
    expect(rec!.verified).toBe(true);
  });

  it("reports verified:false for a tampered/foreign signature", async () => {
    const intentId = `intent-tampered-${Date.now()}`;
    await prisma.intentLog.create({
      data: {
        intentId,
        agentDid: AGENT_DID,
        action: "delete_database",
        decision: "DENY",
        signature: "bm90LWEtcmVhbC1zaWduYXR1cmU=", // "not-a-real-signature"
      },
    });
    const res = await intentsGET(
      req(
        "GET",
        `http://localhost/api/intents?agentDid=${AGENT_DID}&last=50`
      ) as any
    );
    const body = (await res.json()) as {
      intents: Array<{ intentId: string; verified: boolean }>;
    };
    const rec = body.intents.find((i) => i.intentId === intentId);
    expect(rec!.verified).toBe(false);
  });

  it("honors the `last` limit", async () => {
    const res = await intentsGET(
      req("GET", `http://localhost/api/intents?last=1`) as any
    );
    const body = (await res.json()) as { intents: unknown[] };
    expect(body.intents.length).toBeLessThanOrEqual(1);
  });
});
