/**
 * Tests for the device-link flow used by `vaultysclaw login`:
 *   POST /api/user/devices/link           → create link request (public)
 *   GET  /api/user/devices/link/[id]       → poll status (public)
 *   POST /api/user/devices/link/[id]/approve → link to the session user
 *   GET/DELETE /api/user/devices           → list / revoke
 * plus UserDAO.findByLinkedDid resolution (linked DID → owning user).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth-config", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { prisma } from "../packages/control-plane/db/client";
import { UserDAO, UserDeviceDAO, IntentDAO } from "../packages/control-plane/db";
import { signIntent } from "../packages/control-plane/lib/intent-signing";
import { NextRequest } from "next/server";
import { POST as linkPOST } from "../packages/control-plane/app/api/user/devices/link/route";
import { GET as linkGET } from "../packages/control-plane/app/api/user/devices/link/[id]/route";
import { POST as approvePOST } from "../packages/control-plane/app/api/user/devices/link/[id]/approve/route";
import { GET as devicesGET } from "../packages/control-plane/app/api/user/devices/route";
import { DELETE as deviceDELETE } from "../packages/control-plane/app/api/user/devices/[id]/route";
import { GET as deviceLogsGET } from "../packages/control-plane/app/api/user/devices/[id]/logs/route";

const mockSession = getServerSession as ReturnType<typeof vi.fn>;

const USER_ID = "test-cli-link-user";
const USER_DID = "did:test:link:user";
const CLI_DID = "did:test:link:cli";

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    url,
    body !== undefined ? { body } : undefined
  ) as unknown as NextRequest;
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: USER_ID },
    create: { id: USER_ID, did: USER_DID, name: "Linker", role: "Member" },
    update: {},
  });
});

const LOG_DEVICE_DID = "did:test:link:logdev";

afterAll(async () => {
  await prisma.intentLog.deleteMany({ where: { initiatorDid: LOG_DEVICE_DID } });
  await prisma.userDevice.deleteMany({ where: { userId: USER_ID } });
  await prisma.deviceLinkRequest.deleteMany({ where: { did: CLI_DID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
});

beforeEach(() => {
  mockSession.mockResolvedValue({ user: { userId: USER_ID, did: USER_DID } });
});

describe("device-link flow", () => {
  it("links a CLI VaultysId to the session user and resolves it back", async () => {
    // 1. CLI requests a link (public).
    const create = await linkPOST(
      req("POST", "http://localhost/api/user/devices/link", {
        did: CLI_DID,
        publicKey: "cGs=",
        name: "laptop",
      }) as any
    );
    expect(create._status).toBe(201);
    const { id } = (await create.json()) as { id: string };

    // 2. Poll → pending.
    const poll = await linkGET(req("GET", `http://localhost/x`) as any, ctx(id));
    expect((await poll.json()).status).toBe("pending");

    // 3. Approve as the logged-in user.
    const approve = await approvePOST(req("POST", "http://localhost/x") as any, ctx(id));
    expect(approve._status ?? approve.status).toBe(200);

    // Device persisted + resolvable to the owning user.
    const device = await UserDeviceDAO.findByDid(CLI_DID);
    expect(device?.userId).toBe(USER_ID);
    const resolved = await UserDAO.findByLinkedDid(CLI_DID);
    expect(resolved?.id).toBe(USER_ID);

    // 4. Listed under the user's devices.
    const list = await devicesGET(req("GET", "http://localhost/api/user/devices") as any);
    const devices = (await list.json()).devices as Array<{ id: string; did: string }>;
    const linked = devices.find((d) => d.did === CLI_DID);
    expect(linked).toBeDefined();

    // 5. Revoke → no longer resolvable.
    const del = await deviceDELETE(
      req("DELETE", "http://localhost/x") as any,
      ctx(linked!.id)
    );
    expect(del._status ?? del.status).toBe(200);
    expect(await UserDAO.findByLinkedDid(CLI_DID)).toBeNull();
  });

  it("rejects approval without a session (401)", async () => {
    mockSession.mockResolvedValueOnce(null);
    const create = await linkPOST(
      req("POST", "http://localhost/api/user/devices/link", { did: CLI_DID }) as any
    );
    const { id } = (await create.json()) as { id: string };
    const res = await approvePOST(req("POST", "http://localhost/x") as any, ctx(id));
    expect(res._status).toBe(401);
  });

  it("400 when approving an expired request", async () => {
    await prisma.deviceLinkRequest.create({
      data: {
        id: "expired-req",
        did: CLI_DID,
        status: "pending",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await approvePOST(
      req("POST", "http://localhost/x") as any,
      ctx("expired-req")
    );
    expect(res._status).toBe(400);
    await prisma.deviceLinkRequest.deleteMany({ where: { id: "expired-req" } });
  });

  it("findByLinkedDid still resolves a user's own primary DID", async () => {
    const u = await UserDAO.findByLinkedDid(USER_DID);
    expect(u?.id).toBe(USER_ID);
  });
});

describe("GET /api/user/devices/[id]/logs", () => {
  let deviceId: string;

  beforeAll(async () => {
    const device = await UserDeviceDAO.create({
      id: "test-log-device",
      userId: USER_ID,
      did: LOG_DEVICE_DID,
      name: "log-device",
    });
    deviceId = device.id;

    // One signed (verifiable) interaction + one with a bogus signature.
    const sig = await signIntent("intent-log-1", "read_database", "agent-x");
    await IntentDAO.logDecision({
      intentId: "intent-log-1",
      agentDid: "agent-x",
      action: "read_database",
      params: {},
      decision: "ALLOW",
      signature: sig,
      initiatorDid: LOG_DEVICE_DID,
    });
    await IntentDAO.logDecision({
      intentId: "intent-log-2",
      agentDid: "agent-x",
      action: "delete_database",
      params: {},
      decision: "DENY",
      reason: 'no capability "delete_database"',
      signature: "bm90LXJlYWw=",
      initiatorDid: LOG_DEVICE_DID,
    });
  });

  it("returns the device's interactions with re-verified signatures", async () => {
    const res = await deviceLogsGET(
      req("GET", "http://localhost/x") as any,
      ctx(deviceId)
    );
    expect(res._status ?? res.status).toBe(200);
    const body = (await res.json()) as {
      device: { did: string };
      logs: Array<{ intentId: string; decision: string; verified: boolean }>;
    };
    expect(body.device.did).toBe(LOG_DEVICE_DID);
    expect(body.logs).toHaveLength(2);
    const signed = body.logs.find((l) => l.intentId === "intent-log-1");
    const bogus = body.logs.find((l) => l.intentId === "intent-log-2");
    expect(signed!.verified).toBe(true);
    expect(bogus!.verified).toBe(false);
    expect(bogus!.decision).toBe("DENY");
  });

  it("returns 403 when the device belongs to another user", async () => {
    mockSession.mockResolvedValueOnce({
      user: { userId: "someone-else", did: "did:test:other" },
    });
    const res = await deviceLogsGET(
      req("GET", "http://localhost/x") as any,
      ctx(deviceId)
    );
    expect(res._status).toBe(403);
  });

  it("returns 404 for an unknown device", async () => {
    const res = await deviceLogsGET(
      req("GET", "http://localhost/x") as any,
      ctx("no-such-device")
    );
    expect(res._status).toBe(404);
  });
});
