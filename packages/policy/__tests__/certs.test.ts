/**
 * Unit tests for the certificate layer (codec + generic sign/verify + the
 * typed intent / delegation / peer-grant wrappers).
 *
 * These run standalone against a freshly generated VaultysId — no server DB or
 * seeded secret required.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { VaultysId, crypto } from "@vaultys/id";
import {
  packCert,
  unpackCert,
  signCert,
  openCert,
  signIntentCert,
  verifyIntentCert,
  signDelegationCert,
  verifyDelegationCert,
  signPeerGrantCert,
  verifyPeerGrantCert,
} from "../src/index";

const Buf = crypto.Buffer;

let signer: VaultysId; // holds the secret (can sign)
let verifier: VaultysId; // public-key only (VaultysId.fromId)

beforeAll(async () => {
  signer = await VaultysId.generateMachine();
  verifier = VaultysId.fromId(Buf.from(signer.id));
});

// ---------------------------------------------------------------------------
// codec
// ---------------------------------------------------------------------------

describe("packCert / unpackCert", () => {
  it("round-trips body and signature", () => {
    const body = Buf.from([1, 2, 3, 4, 5]);
    const sig = Buf.from([9, 8, 7]);
    const token = packCert(body, sig);
    const parts = unpackCert(token);
    expect(parts).not.toBeNull();
    expect(Buf.from(parts!.body).equals(body)).toBe(true);
    expect(Buf.from(parts!.signature).equals(sig)).toBe(true);
  });

  it("returns null for a token that is too short", () => {
    expect(unpackCert("AAAA")).toBeNull(); // < 5 bytes decoded
  });

  it("returns null when the declared length exceeds the buffer", () => {
    const lenBuf = Buf.allocUnsafe(4);
    lenBuf.writeUInt32LE(9999, 0);
    const token = Buf.concat([lenBuf, Buf.from([1, 2, 3])]).toString("base64");
    expect(unpackCert(token)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generic sign / verify
// ---------------------------------------------------------------------------

describe("signCert / openCert", () => {
  it("round-trips an arbitrary payload", async () => {
    const payload = { hello: "world", n: 42 };
    const token = await signCert(signer, payload);
    expect(openCert(verifier, token)).toEqual(payload);
  });

  it("rejects a tampered body", async () => {
    const token = await signCert(signer, { a: 1 });
    const parts = unpackCert(token)!;
    const badBody = Buf.from(parts.body);
    badBody[badBody.length - 1] ^= 0xff;
    const tampered = packCert(badBody, parts.signature);
    expect(openCert(verifier, tampered)).toBeNull();
  });

  it("rejects verification under the wrong key", async () => {
    const token = await signCert(signer, { a: 1 });
    const stranger = VaultysId.fromId(Buf.from((await VaultysId.generateMachine()).id));
    expect(openCert(stranger, token)).toBeNull();
  });

  it("returns null on malformed input", () => {
    expect(openCert(verifier, "not-base64-cert")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// intent certs
// ---------------------------------------------------------------------------

describe("intent certs", () => {
  it("signs and verifies an intent", async () => {
    const token = await signIntentCert(signer, {
      id: "intent-1",
      action: "api_call",
      agentId: "agent-1",
    });
    const body = verifyIntentCert(verifier, token);
    expect(body).not.toBeNull();
    expect(body!.type).toBe("intent");
    expect(body!.id).toBe("intent-1");
    expect(body!.action).toBe("api_call");
    expect(body!.agentId).toBe("agent-1");
  });

  it("passes matching expectations", async () => {
    const token = await signIntentCert(signer, {
      id: "intent-2",
      action: "file_access",
      agentId: "agent-2",
    });
    expect(
      verifyIntentCert(verifier, token, {
        intentId: "intent-2",
        action: "file_access",
        agentId: "agent-2",
      })
    ).not.toBeNull();
  });

  it("rejects a mismatched intent id / action / agent", async () => {
    const token = await signIntentCert(signer, {
      id: "intent-3",
      action: "api_call",
      agentId: "agent-3",
    });
    expect(verifyIntentCert(verifier, token, { intentId: "other" })).toBeNull();
    expect(verifyIntentCert(verifier, token, { action: "mail_send" })).toBeNull();
    expect(verifyIntentCert(verifier, token, { agentId: "other" })).toBeNull();
  });

  it("skips the agentId check when expected.agentId is null", async () => {
    const token = await signIntentCert(signer, {
      id: "intent-4",
      action: "api_call",
      agentId: "agent-4",
    });
    expect(
      verifyIntentCert(verifier, token, { intentId: "intent-4", agentId: null })
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// delegation certs
// ---------------------------------------------------------------------------

describe("delegation certs", () => {
  it("signs and verifies a delegation", async () => {
    const token = await signDelegationCert(signer, {
      userDid: "did:user:1",
      agentDid: "did:agent:1",
      capabilities: ["api_call", "file_access"],
    });
    const body = verifyDelegationCert(verifier, token);
    expect(body).not.toBeNull();
    expect(body!.type).toBe("delegation");
    expect(body!.capabilities).toEqual(["api_call", "file_access"]);
    expect(typeof body!.issuedAt).toBe("number");
  });

  it("honours a future expiry and rejects a past one", async () => {
    const future = await signDelegationCert(signer, {
      userDid: "u",
      agentDid: "a",
      capabilities: [],
      expiresAt: Date.now() + 3600_000,
    });
    expect(verifyDelegationCert(verifier, future)).not.toBeNull();

    const past = await signDelegationCert(signer, {
      userDid: "u",
      agentDid: "a",
      capabilities: [],
      expiresAt: Date.now() - 1,
    });
    expect(verifyDelegationCert(verifier, past)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// peer-grant certs
// ---------------------------------------------------------------------------

describe("peer-grant certs", () => {
  it("signs and verifies a peer grant", async () => {
    const token = await signPeerGrantCert(signer, {
      sourceDid: "did:agent:src",
      targetDid: "did:agent:dst",
      targetName: "Researcher",
      skillDescription: "answers research questions",
      capabilities: ["agent_communication"],
    });
    const body = verifyPeerGrantCert(verifier, token);
    expect(body).not.toBeNull();
    expect(body!.type).toBe("peer_grant");
    expect(body!.targetName).toBe("Researcher");
  });

  it("rejects an expired peer grant", async () => {
    const token = await signPeerGrantCert(signer, {
      sourceDid: "s",
      targetDid: "d",
      targetName: "n",
      skillDescription: "x",
      capabilities: [],
      expiresAt: Date.now() - 1,
    });
    expect(verifyPeerGrantCert(verifier, token)).toBeNull();
  });

  it("rejects a delegation token presented as a peer grant (type guard)", async () => {
    const delegation = await signDelegationCert(signer, {
      userDid: "u",
      agentDid: "a",
      capabilities: [],
    });
    expect(verifyPeerGrantCert(verifier, delegation)).toBeNull();
  });
});
