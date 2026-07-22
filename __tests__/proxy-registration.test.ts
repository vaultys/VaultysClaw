/**
 * Integration test for the Proxy onboarding path added to ws-server.ts:
 * a `kind: "proxy"` registrant should route through ProxyDAO/ProxyPrincipalDAO
 * instead of AgentDAO, skip capability-cert-reissue entirely, and receive a
 * `proxy_config` push once connected. Modeled on integration.test.ts's real
 * AgentWSServer + real WebSocket client harness (not MockAgent, which is
 * hardcoded to the agent-only register/approve flow).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Challenger, VaultysId, crypto } from "@vaultys/id";
import { AgentWSServer } from "../packages/control-plane/lib/ws-server";
import { prisma } from "../packages/control-plane/db/client";
import { TestWebSocket, waitFor } from "./test-utils";

const Buffer = crypto.Buffer;

let WS_PORT = 8790;
let portInUse = true;
while (portInUse) {
  try {
    require("net").createServer().listen(WS_PORT).close();
    portInUse = false;
  } catch {
    WS_PORT++;
  }
}

/** Send `register` with kind:"proxy", then do a VaultysId challenge handshake. */
async function registerProxy(
  ws: TestWebSocket,
  vid: VaultysId,
  name: string
): Promise<{ terminal: any; sessionId: string }> {
  const initial = await ws.waitForMessage("auth_challenge", 5000);
  ws.ws.send(
    JSON.stringify({
      messageId: `register-${Date.now()}`,
      type: "register",
      payload: { name, version: "0.0.1", kind: "proxy" },
      timestamp: new Date().toISOString(),
    })
  );

  const postRegister = await ws.waitForAnyOf(["auth_challenge"], 5000);
  const sessionId = postRegister.payload.sessionId;

  const challenger = new Challenger(vid.toVersion(1));
  challenger.createChallenge("p2p", "auth");
  let certificate = challenger.getCertificate();

  ws.ws.send(
    JSON.stringify({
      messageId: `auth-${Date.now()}`,
      type: "auth_challenge",
      payload: { sessionId, data: Buffer.from(certificate).toString("base64"), name },
      timestamp: new Date().toISOString(),
    })
  );

  while (true) {
    const msg = await ws.waitForAnyOf(
      ["auth_challenge", "auth_complete", "auth_failed", "registration_pending"],
      5000
    );
    if (msg.type !== "auth_challenge" || !msg.payload.data) {
      return { terminal: msg, sessionId };
    }
    const serverCert = Buffer.from(msg.payload.data, "base64");
    await challenger.update(serverCert);
    certificate = challenger.getCertificate();
    ws.ws.send(
      JSON.stringify({
        messageId: `auth-${Date.now()}`,
        type: "auth_challenge",
        payload: { sessionId, data: Buffer.from(certificate).toString("base64"), name },
        timestamp: new Date().toISOString(),
      })
    );
  }
}

describe("Proxy registration", () => {
  let wsServer: AgentWSServer;

  beforeAll(async () => {
    await prisma.proxyActivityLog.deleteMany();
    await prisma.proxyPrincipal.deleteMany();
    await prisma.proxyRule.deleteMany();
    await prisma.proxyUpstream.deleteMany();
    await prisma.proxy.deleteMany();
    await prisma.pendingRegistration.deleteMany({ where: { kind: "proxy" } });

    wsServer = new AgentWSServer(WS_PORT);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    wsServer.shutdown();
    await prisma.$disconnect();
  });

  it("routes an unknown proxy DID through ProxyDAO, not AgentDAO — and approval skips cert reissue", async () => {
    const vid = (await VaultysId.generateMachine()).toVersion(1);
    const ws = new TestWebSocket(`ws://localhost:${WS_PORT}`);
    await ws.waitForConnection();

    const { terminal } = await registerProxy(ws, vid, "Test Proxy");
    expect(terminal.type).toBe("registration_pending");
    const registrationId = terminal.payload.registrationId;

    // The pending row must be tagged kind:"proxy" (Phase A schema change).
    const pending = await prisma.pendingRegistration.findUnique({
      where: { id: registrationId },
    });
    expect(pending?.kind).toBe("proxy");

    // Approve exactly as an admin would (no capabilities needed for a proxy).
    const approved = await wsServer.approveRegistration(registrationId, []);
    expect(approved).toBe(true);

    // No cert-reissue for proxies: registration_approved -> auth_complete -> proxy_config directly.
    const regApproved = await ws.waitForMessage("registration_approved", 5000);
    expect(regApproved.payload.capabilities).toEqual([]);
    const authComplete = await ws.waitForMessage("auth_complete", 5000);
    const proxyDid = authComplete.payload.did;
    expect(proxyDid).toContain("did:vaultys:");

    const proxyConfig = await ws.waitForMessage("proxy_config", 5000);
    expect(proxyConfig.payload.upstreams).toEqual([]);
    expect(proxyConfig.payload.rules).toEqual([]);
    expect(proxyConfig.payload.principals).toEqual([]);

    // Persisted as a Proxy row, NOT an Agent row.
    const proxyRow = await prisma.proxy.findUnique({ where: { did: proxyDid } });
    expect(proxyRow).toBeTruthy();
    const agentRow = await prisma.agent.findUnique({ where: { did: proxyDid } });
    expect(agentRow).toBeNull();

    ws.close();
  });

  it("auto-approves a reconnecting known proxy DID via ProxyDAO", async () => {
    // First registration + approval (same as above, abbreviated).
    const vid = (await VaultysId.generateMachine()).toVersion(1);
    const ws1 = new TestWebSocket(`ws://localhost:${WS_PORT}`);
    await ws1.waitForConnection();
    const { terminal } = await registerProxy(ws1, vid, "Reconnecting Proxy");
    const registrationId = terminal.payload.registrationId;
    await wsServer.approveRegistration(registrationId, []);
    const authComplete1 = await ws1.waitForMessage("auth_complete", 5000);
    const proxyDid = authComplete1.payload.did;
    ws1.close();

    // Reconnect with the SAME VaultysId — should be auto-approved by DID,
    // never touching PendingRegistration again.
    const ws2 = new TestWebSocket(`ws://localhost:${WS_PORT}`);
    await ws2.waitForConnection();
    const { terminal: terminal2 } = await registerProxy(ws2, vid, "Reconnecting Proxy");
    expect(terminal2.type).toBe("auth_complete");
    expect(terminal2.payload.did).toBe(proxyDid);

    await waitFor(() => !!wsServer.getProxy(proxyDid), 3000);
    ws2.close();
  });

  it("reports activity-log entries and auto-registers an unrecognized principal as pending", async () => {
    const vid = (await VaultysId.generateMachine()).toVersion(1);
    const ws = new TestWebSocket(`ws://localhost:${WS_PORT}`);
    await ws.waitForConnection();
    const { terminal } = await registerProxy(ws, vid, "Logging Proxy");
    await wsServer.approveRegistration(terminal.payload.registrationId, []);
    const authComplete = await ws.waitForMessage("auth_complete", 5000);
    const proxyDid = authComplete.payload.did;
    await ws.waitForMessage("proxy_config", 5000);

    const unknownPrincipalDid = "did:vaultys:" + "b".repeat(40);
    ws.ws.send(
      JSON.stringify({
        messageId: `log-${Date.now()}`,
        type: "proxy_activity_log",
        agentId: proxyDid,
        payload: {
          entries: [
            {
              method: "GET",
              url: "https://example.com/api/thing",
              mode: "governed",
              verdict: "deny",
              reason: "Unrecognized principal",
              principalDid: unknownPrincipalDid,
              identitySource: "proxy_provisioned",
              timestamp: new Date().toISOString(),
              latencyMs: 5,
            },
          ],
        },
        timestamp: new Date().toISOString(),
      })
    );

    await waitFor(async () => {
      const principal = await prisma.proxyPrincipal.findUnique({
        where: { proxyDid_did: { proxyDid, did: unknownPrincipalDid } },
      });
      return principal !== null;
    }, 5000);

    const principal = await prisma.proxyPrincipal.findUnique({
      where: { proxyDid_did: { proxyDid, did: unknownPrincipalDid } },
    });
    expect(principal?.status).toBe("pending");
    expect(principal?.provisionedByProxy).toBe(true);

    const logs = await prisma.proxyActivityLog.findMany({ where: { proxyDid } });
    expect(logs.length).toBe(1);
    expect(logs[0].verdict).toBe("deny");

    ws.close();
  });
});
