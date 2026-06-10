/**
 * Tests for intent signing (control-plane → agent) and verification (agent side).
 *
 * Covers:
 *   - signIntent produces a valid base64 token
 *   - verifyIntentMessage accepts a legitimately signed message
 *   - verifyIntentMessage rejects a missing signature
 *   - verifyIntentMessage rejects a signature made with a different key
 *   - verifyIntentMessage rejects a message whose envelope fields don't match the body
 *   - verifyIntentMessage rejects a truncated / malformed token
 *   - verifyIntentMessage rejects the wrong message type in the body
 *
 * Strategy: use real VaultysId crypto (no mocks for the signing primitive itself).
 * SettingsDAO.get is mocked so signIntent doesn't need a live DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { VaultysId, crypto } from "@vaultys/id";
import { encode as msgpackEncode } from "@msgpack/msgpack";
import type { WSMessage } from "../packages/shared/src/types";

// ---------------------------------------------------------------------------
// Mock SettingsDAO so signIntent can call SettingsDAO.get("serverSecret")
// without a real database.
// vi.hoisted() lifts the variable so the vi.mock factory can reference it.
// ---------------------------------------------------------------------------

const { mockSettingsGet } = vi.hoisted(() => ({
  mockSettingsGet: vi.fn<[string], Promise<string | null>>(),
}));

vi.mock("@/db", () => ({
  SettingsDAO: { get: mockSettingsGet },
}));

// Also mock pino so tests don't produce log output
vi.mock("pino", () => ({ default: () => ({ warn: vi.fn(), info: vi.fn() }) }));

import { signIntent } from "../packages/control-plane/lib/intent-signing";
import { verifyIntentMessage } from "../packages/agent-controller/src/intent-verify";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const Buf = crypto.Buffer;

/** Generate a fresh ephemeral VaultysId and return { vid, secret, publicKey } */
async function makeIdentity() {
  const generated = await VaultysId.generateMachine();
  const vid = generated.toVersion(1);
  const secret = vid.getSecret("base64") as string;
  // vid.id returns the raw public-key Buffer (same bytes that fromId() accepts)
  const publicKey = Buf.from(vid.id) as Buffer;
  return { vid, secret, publicKey };
}

/** Build a minimal valid WSMessage envelope */
function makeEnvelope(
  messageId: string,
  agentId: string,
  signature?: string
): WSMessage {
  return {
    messageId,
    type: "intent",
    agentId,
    payload: { id: messageId, action: "summarize", params: {}, timestamp: new Date().toISOString() },
    timestamp: new Date().toISOString(),
    ...(signature !== undefined ? { signature } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("signIntent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when SettingsDAO.get returns null (server secret not initialised)", async () => {
    mockSettingsGet.mockResolvedValue(null);
    const result = await signIntent("intent-1", "summarize", "agent-1");
    expect(result).toBeNull();
  });

  it("returns a non-empty base64 string when the server secret is present", async () => {
    const { secret } = await makeIdentity();
    mockSettingsGet.mockResolvedValue(secret);

    const token = await signIntent("intent-abc", "summarize", "agent-xyz");
    expect(typeof token).toBe("string");
    expect(token!.length).toBeGreaterThan(0);
    // Must be valid base64
    expect(() => Buf.from(token!, "base64")).not.toThrow();
  });

  it("encoded token contains a length-prefixed msgpack body + signature", async () => {
    const { secret } = await makeIdentity();
    mockSettingsGet.mockResolvedValue(secret);

    const token = await signIntent("intent-123", "run_code", "agent-abc");
    const combined = Buf.from(token!, "base64");

    // Minimum: 4-byte length header + 1-byte msgpack + 1-byte sig
    expect(combined.length).toBeGreaterThan(5);

    const bodyLen = combined.readUInt32LE(0);
    expect(combined.length).toBeGreaterThanOrEqual(4 + bodyLen);
  });
});

describe("verifyIntentMessage — happy path", () => {
  it("accepts a legitimately signed message (sign then verify round-trip)", async () => {
    const { secret, publicKey } = await makeIdentity();
    mockSettingsGet.mockResolvedValue(secret);

    const intentId = "intent-roundtrip-1";
    const agentId = "agent-rt-1";
    const token = await signIntent(intentId, "translate", agentId);
    expect(token).not.toBeNull();

    const msg = makeEnvelope(intentId, agentId, token!);
    expect(verifyIntentMessage(msg, publicKey)).toBe(true);
  });

  it("verifies correctly when action contains special characters", async () => {
    const { secret, publicKey } = await makeIdentity();
    mockSettingsGet.mockResolvedValue(secret);

    const intentId = "intent-special";
    const agentId = "agent-special";
    const token = await signIntent(intentId, "do:something/complex", agentId);
    const msg = makeEnvelope(intentId, agentId, token!);
    expect(verifyIntentMessage(msg, publicKey)).toBe(true);
  });
});

describe("verifyIntentMessage — rejection cases", () => {
  it("rejects when signature field is missing", async () => {
    const { publicKey } = await makeIdentity();
    const msg = makeEnvelope("intent-no-sig", "agent-1");
    // No signature field
    expect(verifyIntentMessage(msg, publicKey)).toBe(false);
  });

  it("rejects an empty string signature", async () => {
    const { publicKey } = await makeIdentity();
    const msg = makeEnvelope("intent-empty", "agent-1", "");
    expect(verifyIntentMessage(msg, publicKey)).toBe(false);
  });

  it("rejects when the signature was made by a different key", async () => {
    const signer = await makeIdentity();
    const verifier = await makeIdentity(); // different identity
    mockSettingsGet.mockResolvedValue(signer.secret);

    const intentId = "intent-wrong-key";
    const agentId = "agent-wk";
    const token = await signIntent(intentId, "summarize", agentId);
    const msg = makeEnvelope(intentId, agentId, token!);

    // Verify with the wrong public key — must reject
    expect(verifyIntentMessage(msg, verifier.publicKey)).toBe(false);
  });

  it("rejects when messageId in envelope doesn't match body id", async () => {
    const { secret, publicKey } = await makeIdentity();
    mockSettingsGet.mockResolvedValue(secret);

    // Sign as intent-A
    const token = await signIntent("intent-A", "summarize", "agent-1");
    // But envelope says intent-B
    const msg = makeEnvelope("intent-B", "agent-1", token!);
    expect(verifyIntentMessage(msg, publicKey)).toBe(false);
  });

  it("rejects when agentId in envelope doesn't match body agentId", async () => {
    const { secret, publicKey } = await makeIdentity();
    mockSettingsGet.mockResolvedValue(secret);

    const token = await signIntent("intent-1", "summarize", "agent-original");
    // Envelope claims a different agentId
    const msg = makeEnvelope("intent-1", "agent-impostor", token!);
    expect(verifyIntentMessage(msg, publicKey)).toBe(false);
  });

  it("rejects a token that is too short to contain a body length header", async () => {
    const { publicKey } = await makeIdentity();
    // Only 3 bytes — less than the 4-byte LE header
    const tooShort = Buf.from([0x01, 0x02, 0x03]).toString("base64");
    const msg = makeEnvelope("intent-short", "agent-1", tooShort);
    expect(verifyIntentMessage(msg, publicKey)).toBe(false);
  });

  it("rejects when the body claims type !== 'intent'", async () => {
    const { vid, publicKey } = await makeIdentity();

    // Manually craft a token with type = "delegation"
    const body = Buf.from(
      msgpackEncode({
        type: "delegation",
        id: "intent-1",
        action: "summarize",
        agentId: "agent-1",
        timestamp: Date.now(),
      })
    );
    const sig = await vid.signChallenge(body);
    const lenBuf = Buf.allocUnsafe(4);
    lenBuf.writeUInt32LE(body.length, 0);
    const combined = Buf.concat([lenBuf, body, Buf.from(sig)]);
    const token = combined.toString("base64");

    const msg = makeEnvelope("intent-1", "agent-1", token);
    expect(verifyIntentMessage(msg, publicKey)).toBe(false);
  });

  it("rejects a base64 token with valid length header but truncated body", async () => {
    const { publicKey } = await makeIdentity();
    // Write a length header claiming 100 bytes but only provide 10
    const lenBuf = Buf.allocUnsafe(4);
    lenBuf.writeUInt32LE(100, 0);
    const shortBody = Buf.alloc(10, 0x42);
    const truncated = Buf.concat([lenBuf, shortBody]).toString("base64");

    const msg = makeEnvelope("intent-trunc", "agent-1", truncated);
    expect(verifyIntentMessage(msg, publicKey)).toBe(false);
  });
});
