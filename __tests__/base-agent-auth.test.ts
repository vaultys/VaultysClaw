/**
 * Tests for BaseAgentRuntime auth flow — specifically that serverPublicKey is
 * correctly extracted from the auth challenger after the handshake completes.
 *
 * Regression test for the bug introduced in commit b2123bc (agent-runtime
 * refactor): the base class nulled authChallenger before the subclass hook
 * could read pk1 from it, and the subclass fell back to a DB query that was
 * never populated, leaving serverPublicKey = null.  Intent signature
 * verification therefore always failed.
 *
 * Covered cases:
 *   - After a complete auth handshake, serverPublicKey equals the server's pk1
 *   - serverPublicKey allows verifying an intent signed by the server
 *   - An intent with no signature is rejected after auth
 *   - An intent signed by a different (unknown) key is rejected after auth
 */

import { describe, it, expect } from "vitest";
import { Challenger, VaultysId, crypto } from "@vaultys/id";
import type {
  WSMessage,
  WSAuthCompletePayload,
  ChatMessageEntry,
  ChatErrorCode,
} from "@vaultysclaw/shared";
import { BaseAgentRuntime } from "../packages/sdk/src/base-agent";
import { verifyIntentMessage } from "../packages/sdk/src/intent-verify";
import { encode as msgpackEncode } from "@msgpack/msgpack";

const Buf = crypto.Buffer;

// ---------------------------------------------------------------------------
// TestAgent — minimal concrete subclass of BaseAgentRuntime for testing
// ---------------------------------------------------------------------------

class TestAgent extends BaseAgentRuntime {
  /** Messages the agent would have sent over WebSocket. */
  readonly outgoing: WSMessage[] = [];

  /** Resolved when auth_complete has been fully processed. */
  private authCompletedResolve?: () => void;
  authCompleted = new Promise<void>((r) => (this.authCompletedResolve = r));

  constructor(agentVid: VaultysId) {
    super({
      name: "test-agent",
      controlPlaneUrl: "http://localhost",
      vaultysIdPath: "/unused",
      requestedCapabilities: [],
    });
    // Inject identity directly — bypasses filesystem access
    (this as any).vaultysId = agentVid;
  }

  /** Make protected handleMessage callable from tests. */
  receiveMessage(msg: WSMessage): void {
    this.handleMessage(JSON.stringify(msg));
  }

  /** Expose protected serverPublicKey for assertions. */
  get serverKey(): Buffer | null {
    return (this as any).serverPublicKey as Buffer | null;
  }

  // Capture outgoing messages instead of writing to a WebSocket
  protected override send(message: WSMessage): void {
    this.outgoing.push(message);
  }

  protected override async onAuthComplete(
    _payload: WSAuthCompletePayload
  ): Promise<void> {
    this.authCompletedResolve?.();
  }

  // Abstract method stubs
  async executeIntent(): Promise<unknown> {
    return {};
  }
  async executeChat(
    _msgs: ChatMessageEntry[],
    _id: string,
    sendChunk: (c: string, done?: boolean, isError?: boolean, code?: ChatErrorCode) => void
  ): Promise<void> {
    sendChunk("", true);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run the full 3-round Challenger handshake between agent and server. */
async function runAuthHandshake(agent: TestAgent, serverVid: VaultysId) {
  const serverChallenger = new Challenger(serverVid.toVersion(1));

  // Round 1: trigger agent to create its challenger and send C1
  // First auth_challenge (no data, no sessionId) → agent sends register
  agent.receiveMessage({
    messageId: "auth-1",
    type: "auth_challenge",
    agentId: "",
    payload: { sessionId: "test-session", data: "" },
    timestamp: new Date().toISOString(),
  });

  // Flush the micro-task queue so the async handler runs
  await new Promise((r) => setTimeout(r, 0));

  // Agent sent a "register" message — now send the second auth_challenge
  // that triggers startAuthHandshake
  agent.receiveMessage({
    messageId: "auth-2",
    type: "auth_challenge",
    agentId: "",
    payload: { sessionId: "test-session", data: "" },
    timestamp: new Date().toISOString(),
  });

  await new Promise((r) => setTimeout(r, 0));

  // Agent sent its initial challenger cert (C1) — find it
  const c1Msg = agent.outgoing.find(
    (m) => m.type === "auth_challenge" && (m.payload as any).data
  );
  expect(c1Msg).toBeDefined();
  const c1 = Buf.from((c1Msg!.payload as any).data, "base64");

  // Round 2: server processes C1 → produces C2
  await serverChallenger.update(c1);
  const c2 = serverChallenger.getCertificate();

  // Send C2 to agent
  agent.receiveMessage({
    messageId: "auth-3",
    type: "auth_challenge",
    agentId: "",
    payload: { sessionId: "test-session", data: Buf.from(c2).toString("base64") },
    timestamp: new Date().toISOString(),
  });

  await new Promise((r) => setTimeout(r, 0));

  // Agent is now complete (state 2). Server processes C3.
  const c3Msg = agent.outgoing.find(
    (m) =>
      m.type === "auth_challenge" &&
      (m.payload as any).data &&
      m.messageId !== c1Msg!.messageId
  );
  expect(c3Msg).toBeDefined();
  const c3 = Buf.from((c3Msg!.payload as any).data, "base64");
  await serverChallenger.update(c3);
  expect(serverChallenger.isComplete()).toBe(true);

  // Server sends auth_complete
  agent.receiveMessage({
    messageId: "auth-complete-1",
    type: "auth_complete",
    agentId: "agent-did-123",
    payload: {
      agentId: "agent-did-123",
      did: "agent-did-123",
      capabilities: [],
    } satisfies WSAuthCompletePayload,
    timestamp: new Date().toISOString(),
  });

  // Wait for the async handleAuthComplete to finish
  await agent.authCompleted;
}

/** Sign an intent the same way the control plane does (intent-signing.ts). */
async function signIntentToken(
  serverVid: VaultysId,
  intentId: string,
  action: string,
  agentId: string
): Promise<string> {
  const body = Buf.from(
    msgpackEncode({ type: "intent", id: intentId, action, agentId, timestamp: Date.now() })
  );
  const sig = await serverVid.signChallenge(body);
  const lenBuf = Buf.allocUnsafe(4);
  lenBuf.writeUInt32LE(body.length, 0);
  return Buf.concat([lenBuf, body, Buf.from(sig)]).toString("base64");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BaseAgentRuntime auth → serverPublicKey extraction", () => {
  it("sets serverPublicKey to the server's key (pk2) after auth_complete", async () => {
    const serverVid = (await VaultysId.generateMachine()).toVersion(1);
    const agentVid = (await VaultysId.generateMachine()).toVersion(1);
    const agent = new TestAgent(agentVid);

    await runAuthHandshake(agent, serverVid);

    expect(agent.serverKey).not.toBeNull();
    // In the Challenger protocol the agent is the initiator → pk1 = agent, pk2 = server.
    // serverPublicKey must equal pk2 from the cert (normalized to v1) = serverVid.id
    expect(Buffer.from(agent.serverKey!).equals(Buffer.from(serverVid.id))).toBe(true);
  });

  it("serverPublicKey allows verifying a subsequent server-signed intent", async () => {
    const serverVid = (await VaultysId.generateMachine()).toVersion(1);
    const agentVid = (await VaultysId.generateMachine()).toVersion(1);
    const agent = new TestAgent(agentVid);

    await runAuthHandshake(agent, serverVid);
    expect(agent.serverKey).not.toBeNull();

    const intentId = "intent-post-auth-1";
    const agentDid = "agent-did-123";
    const token = await signIntentToken(serverVid, intentId, "summarize", agentDid);

    const msg: WSMessage = {
      messageId: intentId,
      type: "intent",
      agentId: agentDid,
      payload: { id: intentId, action: "summarize", params: {}, timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
      signature: token,
    };

    expect(verifyIntentMessage(msg, agent.serverKey!)).toBe(true);
  });

  it("rejects an intent with no signature after auth (unsigned = rejected)", async () => {
    const serverVid = (await VaultysId.generateMachine()).toVersion(1);
    const agentVid = (await VaultysId.generateMachine()).toVersion(1);
    const agent = new TestAgent(agentVid);

    await runAuthHandshake(agent, serverVid);
    expect(agent.serverKey).not.toBeNull();

    const msg: WSMessage = {
      messageId: "intent-no-sig",
      type: "intent",
      agentId: "agent-did-123",
      payload: { id: "intent-no-sig", action: "summarize", params: {}, timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
      // no signature field
    };

    expect(verifyIntentMessage(msg, agent.serverKey!)).toBe(false);
  });

  it("rejects an intent signed by a different (unknown) server key", async () => {
    const serverVid = (await VaultysId.generateMachine()).toVersion(1);
    const rogueVid = (await VaultysId.generateMachine()).toVersion(1);
    const agentVid = (await VaultysId.generateMachine()).toVersion(1);
    const agent = new TestAgent(agentVid);

    await runAuthHandshake(agent, serverVid);
    expect(agent.serverKey).not.toBeNull();

    // Sign with a rogue key
    const intentId = "intent-rogue";
    const token = await signIntentToken(rogueVid, intentId, "summarize", "agent-did-123");

    const msg: WSMessage = {
      messageId: intentId,
      type: "intent",
      agentId: "agent-did-123",
      payload: { id: intentId, action: "summarize", params: {}, timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
      signature: token,
    };

    expect(verifyIntentMessage(msg, agent.serverKey!)).toBe(false);
  });
});
