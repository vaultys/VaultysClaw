/**
 * Round-trip tests for the audit signature helper used by `audit tail`:
 *   signIntent → verifyIntentSignature
 *
 * SettingsDAO.get is mocked so no DB is needed (same approach as
 * intent-signing.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { VaultysId, crypto } from "@vaultys/id";

const { mockSettingsGet } = vi.hoisted(() => ({
  mockSettingsGet: vi.fn<[string], Promise<string | null>>(),
}));
vi.mock("@/db", () => ({ SettingsDAO: { get: mockSettingsGet } }));
vi.mock("pino", () => ({ default: () => ({ warn: vi.fn(), info: vi.fn() }) }));

import {
  signIntent,
  verifyIntentSignature,
} from "../packages/control-plane/lib/intent-signing";

const Buf = crypto.Buffer;

async function newSecret(): Promise<string> {
  return (await VaultysId.generateMachine()).toVersion(1).getSecret("base64") as string;
}

beforeEach(() => vi.clearAllMocks());

describe("verifyIntentSignature", () => {
  it("verifies a freshly signed audit record (round-trip)", async () => {
    mockSettingsGet.mockResolvedValue(await newSecret());
    const sig = await signIntent("intent-1", "delete_database", "agent-1");
    expect(sig).toBeTruthy();
    expect(await verifyIntentSignature(sig)).toBe(true);
    expect(
      await verifyIntentSignature(sig, {
        intentId: "intent-1",
        action: "delete_database",
        agentId: "agent-1",
      })
    ).toBe(true);
  });

  it("rejects when the expected envelope fields don't match", async () => {
    mockSettingsGet.mockResolvedValue(await newSecret());
    const sig = await signIntent("intent-1", "delete_database", "agent-1");
    expect(await verifyIntentSignature(sig, { intentId: "other" })).toBe(false);
    expect(await verifyIntentSignature(sig, { action: "read_database" })).toBe(false);
    expect(await verifyIntentSignature(sig, { agentId: "agent-2" })).toBe(false);
  });

  it("returns false for null/empty signatures", async () => {
    mockSettingsGet.mockResolvedValue(await newSecret());
    expect(await verifyIntentSignature(null)).toBe(false);
    expect(await verifyIntentSignature("")).toBe(false);
  });

  it("returns false when the server secret is missing", async () => {
    mockSettingsGet.mockResolvedValue(null);
    expect(await verifyIntentSignature("AAAA")).toBe(false);
  });

  it("rejects a signature made with a different key", async () => {
    const signerSecret = await newSecret();
    mockSettingsGet.mockResolvedValue(signerSecret);
    const sig = await signIntent("intent-1", "x", "agent-1");
    // Now the "server" is a different identity.
    mockSettingsGet.mockResolvedValue(await newSecret());
    expect(await verifyIntentSignature(sig)).toBe(false);
  });

  it("rejects a flipped byte in the signature", async () => {
    mockSettingsGet.mockResolvedValue(await newSecret());
    const sig = await signIntent("intent-1", "x", "agent-1");
    const buf = Buf.from(sig!, "base64");
    buf[buf.length - 1] ^= 0xff; // corrupt the last byte
    expect(await verifyIntentSignature(buf.toString("base64"))).toBe(false);
  });

  it("rejects a truncated envelope", async () => {
    mockSettingsGet.mockResolvedValue(await newSecret());
    const tooShort = Buf.from([1, 2, 3]).toString("base64");
    expect(await verifyIntentSignature(tooShort)).toBe(false);
  });
});
