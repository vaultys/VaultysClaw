/**
 * Tests for delegation certificate utilities (lib/delegation.ts).
 *
 * Covers:
 *   - signDelegation / verifyDelegation round-trip
 *   - Expiry enforcement
 *   - Signature tampering detection
 *   - Malformed cert handling (truncated, wrong type, corrupt msgpack)
 *   - Wire format correctness
 */

import { describe, it, expect, beforeAll } from "vitest";
import { VaultysId, crypto } from "@vaultys/id";
import {
  encode as msgpackEncode,
  decode as msgpackDecode,
} from "@msgpack/msgpack";
import {
  signDelegation,
  verifyDelegation,
  type DelegationPayload,
} from "../packages/control-plane/lib/delegation";
import { SettingsDAO } from "../packages/control-plane/db/settings.dao";

const Buffer = crypto.Buffer;

// ---------------------------------------------------------------------------
// Setup — server identity (global-setup seeds serverSecret in the test DB)
// ---------------------------------------------------------------------------

let serverPublicKey: Buffer;

beforeAll(async () => {
  const serverSecret = await SettingsDAO.get("serverSecret");
  if (!serverSecret) throw new Error("serverSecret not seeded — check global-setup.ts");
  const vid = VaultysId.fromSecret(serverSecret, "base64");
  serverPublicKey = Buffer.from(vid.id);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sign(
  userDid = "did:vaultys:user-deleg-001",
  agentDid = "did:vaultys:agent-deleg-001",
  capabilities = ["read", "write"],
  expiresAt?: Date
): Promise<string> {
  return signDelegation(userDid, agentDid, capabilities, expiresAt);
}

// ---------------------------------------------------------------------------
// Happy-path round-trip
// ---------------------------------------------------------------------------

describe("signDelegation + verifyDelegation round-trip", () => {
  it("returns a non-empty base64 string", async () => {
    const cert = await sign();
    expect(typeof cert).toBe("string");
    expect(cert.length).toBeGreaterThan(0);
    // Valid base64 — should decode without error
    expect(() => Buffer.from(cert, "base64")).not.toThrow();
  });

  it("verifies to the correct payload fields", async () => {
    const userDid = "did:vaultys:user-rt-001";
    const agentDid = "did:vaultys:agent-rt-001";
    const capabilities = ["read", "execute"];

    const cert = await sign(userDid, agentDid, capabilities);
    const payload = await verifyDelegation(cert, serverPublicKey);

    expect(payload).not.toBeNull();
    expect(payload!.type).toBe("delegation");
    expect(payload!.userDid).toBe(userDid);
    expect(payload!.agentDid).toBe(agentDid);
    expect(payload!.capabilities).toEqual(capabilities);
  });

  it("sets issuedAt to approximately now", async () => {
    const before = Date.now();
    const cert = await sign();
    const after = Date.now();

    const payload = await verifyDelegation(cert, serverPublicKey);
    expect(payload!.issuedAt).toBeGreaterThanOrEqual(before);
    expect(payload!.issuedAt).toBeLessThanOrEqual(after);
  });

  it("omits expiresAt when none is given", async () => {
    const cert = await sign();
    const payload = await verifyDelegation(cert, serverPublicKey);
    expect(payload!.expiresAt).toBeUndefined();
  });

  it("includes expiresAt when provided", async () => {
    const future = new Date(Date.now() + 3_600_000); // +1 h
    const cert = await sign("did:u", "did:a", ["r"], future);
    const payload = await verifyDelegation(cert, serverPublicKey);
    expect(payload!.expiresAt).toBe(future.getTime());
  });

  it("works with wildcard agentDid (*)", async () => {
    const cert = await signDelegation("did:vaultys:user", "*", ["read"]);
    const payload = await verifyDelegation(cert, serverPublicKey);
    expect(payload!.agentDid).toBe("*");
  });

  it("works with an empty capabilities list", async () => {
    const cert = await sign("did:u", "did:a", []);
    const payload = await verifyDelegation(cert, serverPublicKey);
    expect(payload!.capabilities).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

describe("verifyDelegation — expiry enforcement", () => {
  it("accepts a cert that expires in the future", async () => {
    const future = new Date(Date.now() + 60_000);
    const cert = await sign("did:u", "did:a", ["r"], future);
    expect(await verifyDelegation(cert, serverPublicKey)).not.toBeNull();
  });

  it("rejects a cert that has already expired", async () => {
    const past = new Date(Date.now() - 1_000); // 1 second ago
    const cert = await sign("did:u", "did:a", ["r"], past);
    expect(await verifyDelegation(cert, serverPublicKey)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Signature tampering
// ---------------------------------------------------------------------------

describe("verifyDelegation — signature tampering", () => {
  it("rejects a cert with a flipped bit in the signature", async () => {
    const cert = await sign();
    const raw = Buffer.from(cert, "base64");

    // Flip the last byte of the combined buffer (signature area)
    raw[raw.length - 1] ^= 0xff;
    const tampered = raw.toString("base64");

    expect(await verifyDelegation(tampered, serverPublicKey)).toBeNull();
  });

  it("rejects a cert with a flipped bit in the body", async () => {
    const cert = await sign();
    const raw = Buffer.from(cert, "base64");

    // Flip a byte in the msgpack body (after the 4-byte length prefix)
    const bodyLen = raw.readUInt32LE(0);
    // Flip the middle of the body
    raw[4 + Math.floor(bodyLen / 2)] ^= 0x01;
    const tampered = raw.toString("base64");

    expect(await verifyDelegation(tampered, serverPublicKey)).toBeNull();
  });

  it("rejects a cert signed with a different server key", async () => {
    // Create a different server key
    const otherVid = await VaultysId.generateMachine();
    const otherPublicKey = Buffer.from(otherVid.id);

    const cert = await sign(); // signed with the real server key
    // Verify against a different key — should fail
    expect(await verifyDelegation(cert, otherPublicKey)).toBeNull();
  });

  it("rejects a cert whose body length prefix is manipulated", async () => {
    const cert = await sign();
    const raw = Buffer.from(cert, "base64");

    // Corrupt the 4-byte length prefix to a much larger value
    raw.writeUInt32LE(raw.length + 100, 0);
    const tampered = raw.toString("base64");

    expect(await verifyDelegation(tampered, serverPublicKey)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Payload field tampering
// ---------------------------------------------------------------------------

describe("verifyDelegation — payload field tampering", () => {
  it("rejects a cert whose type field is not 'delegation'", async () => {
    // Build a cert manually with type: "intent"
    const serverSecret = await SettingsDAO.get("serverSecret");
    const vid = VaultysId.fromSecret(serverSecret!, "base64");

    const payload = {
      type: "intent", // wrong type
      userDid: "did:u",
      agentDid: "did:a",
      capabilities: ["r"],
      issuedAt: Date.now(),
    };

    const body = Buffer.from(msgpackEncode(payload));
    const signature = await vid.signChallenge(body);
    const lenBuf = Buffer.allocUnsafe(4);
    lenBuf.writeUInt32LE(body.length, 0);
    const combined = Buffer.concat([lenBuf, body, Buffer.from(signature)]);
    const cert = combined.toString("base64");

    expect(await verifyDelegation(cert, serverPublicKey)).toBeNull();
  });

  it("rejects a cert with capabilities replaced post-signing", async () => {
    const cert = await sign("did:u", "did:a", ["read"]);
    const raw = Buffer.from(cert, "base64");
    const bodyLen = raw.readUInt32LE(0);

    // Decode the msgpack body, change capabilities, re-encode
    const body = raw.subarray(4, 4 + bodyLen);
    const decoded = msgpackDecode(body) as DelegationPayload;
    decoded.capabilities = ["admin", "delete"]; // escalated!
    const newBody = Buffer.from(msgpackEncode(decoded));

    // Splice the new body back in (signature remains from old body)
    const sig = raw.subarray(4 + bodyLen);
    const newLenBuf = Buffer.allocUnsafe(4);
    newLenBuf.writeUInt32LE(newBody.length, 0);
    const tampered = Buffer.concat([newLenBuf, newBody, sig]).toString("base64");

    expect(await verifyDelegation(tampered, serverPublicKey)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Malformed input
// ---------------------------------------------------------------------------

describe("verifyDelegation — malformed input", () => {
  it("returns null for an empty string", async () => {
    expect(await verifyDelegation("", serverPublicKey)).toBeNull();
  });

  it("returns null for non-base64 garbage", async () => {
    expect(await verifyDelegation("not-valid-!!!", serverPublicKey)).toBeNull();
  });

  it("returns null for a cert shorter than 5 bytes", async () => {
    const tiny = Buffer.from([0x01, 0x02, 0x03]).toString("base64");
    expect(await verifyDelegation(tiny, serverPublicKey)).toBeNull();
  });

  it("returns null for a cert with body length larger than the buffer", async () => {
    // 4-byte LE value = 999999, but buffer only has a few more bytes
    const buf = Buffer.allocUnsafe(10);
    buf.writeUInt32LE(999999, 0);
    expect(await verifyDelegation(buf.toString("base64"), serverPublicKey)).toBeNull();
  });

  it("returns null for corrupt msgpack data", async () => {
    // Construct a valid-looking length prefix but corrupt msgpack body
    const fakeBody = Buffer.from([0xff, 0xff, 0xff, 0xff, 0xfe]); // invalid msgpack
    const fakeSig = Buffer.alloc(64, 0x00);
    const lenBuf = Buffer.allocUnsafe(4);
    lenBuf.writeUInt32LE(fakeBody.length, 0);
    const combined = Buffer.concat([lenBuf, fakeBody, fakeSig]);
    expect(await verifyDelegation(combined.toString("base64"), serverPublicKey)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

describe("signDelegation — wire format", () => {
  it("encodes as 4-byte LE body length + msgpack body + signature", async () => {
    const cert = await sign();
    const raw = Buffer.from(cert, "base64");

    // Read body length from first 4 bytes
    const bodyLen = raw.readUInt32LE(0);
    expect(bodyLen).toBeGreaterThan(0);
    expect(raw.length).toBeGreaterThan(4 + bodyLen); // must have signature bytes

    // Body should decode as valid msgpack with expected fields
    const body = raw.subarray(4, 4 + bodyLen);
    const decoded = msgpackDecode(body) as DelegationPayload;
    expect(decoded.type).toBe("delegation");
    expect(typeof decoded.userDid).toBe("string");
    expect(Array.isArray(decoded.capabilities)).toBe(true);
  });

  it("two certs for the same payload have different signatures (random nonce)", async () => {
    const cert1 = await sign("did:u", "did:a", ["r"]);
    const cert2 = await sign("did:u", "did:a", ["r"]);
    // issuedAt differs by at least 1ms; the raw bytes should differ
    // (even if issuedAt is identical the nonce from signChallenge makes them differ)
    expect(cert1).not.toBe(cert2);
  });
});
