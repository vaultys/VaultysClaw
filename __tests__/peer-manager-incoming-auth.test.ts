/**
 * Regression test for isIncomingAuthorized in peer-manager.ts.
 *
 * Bug 1: the function used to `return true` unconditionally after the grant
 * loop, regardless of whether a matching grant was found — meaning any peer
 * that completed the SRP handshake (proving identity, not authorization)
 * could invoke skills on this agent even with zero peer grants. Fixed to
 * return false when no matching grant is found.
 *
 * Bug 2: when no server public key had been received yet, a matching grant
 * was accepted without any certificate verification ("fail open"). Fixed to
 * reject (fail closed) until the server key is available, since an
 * unverified grant is not proof of authorization — only the SRP handshake
 * proves identity.
 */

import { describe, it, expect, vi } from "vitest";
import { VaultysId } from "@vaultys/id";
import type { AgentPeerGrant } from "@vaultysclaw/shared";
import { PeerManager } from "../packages/agent-runtime/src/peer-manager";

vi.mock("../packages/agent-runtime/src/peer-grant-verify", () => ({
  verifyPeerGrant: vi.fn(async (cert: string) => (cert === "valid-cert" ? { ok: true } : null)),
}));

function makeGrant(ownDid: string, overrides: Partial<AgentPeerGrant> = {}): AgentPeerGrant {
  return {
    id: "grant-1",
    sourceDid: "did:vaultys:remote",
    targetDid: ownDid,
    targetName: "Own Agent",
    skillDescription: "",
    capabilities: [],
    certificate: "valid-cert",
    ...overrides,
  } as AgentPeerGrant;
}

async function makePeerManager() {
  const vid = (await VaultysId.generateMachine()).toVersion(1);
  const pm = new PeerManager(vid);
  return { pm, ownDid: vid.did };
}

describe("PeerManager.isIncomingAuthorized", () => {
  it("rejects a remote DID with no grant at all in the catalog", async () => {
    const { pm } = await makePeerManager();
    pm.updatePeerCatalog([]);
    const authorized = await (pm as any).isIncomingAuthorized("did:vaultys:stranger");
    expect(authorized).toBe(false);
  });

  it("rejects a remote DID that has a grant pointed at a different target", async () => {
    const { pm, ownDid } = await makePeerManager();
    pm.updatePeerCatalog([makeGrant(ownDid, { sourceDid: "did:vaultys:someone-else" })]);
    const authorized = await (pm as any).isIncomingAuthorized("did:vaultys:stranger");
    expect(authorized).toBe(false);
  });

  it("rejects a matching grant when no server key is set yet (fail closed — cert can't be verified)", async () => {
    const { pm, ownDid } = await makePeerManager();
    pm.updatePeerCatalog([makeGrant(ownDid, { sourceDid: "did:vaultys:remote" })]);
    const authorized = await (pm as any).isIncomingAuthorized("did:vaultys:remote");
    expect(authorized).toBe(false);
  });

  it("allows a matching grant with a certificate that verifies against the server key", async () => {
    const { pm, ownDid } = await makePeerManager();
    pm.setServerPublicKey(new Uint8Array([1, 2, 3]));
    pm.updatePeerCatalog([makeGrant(ownDid, { sourceDid: "did:vaultys:remote", certificate: "valid-cert" })]);
    const authorized = await (pm as any).isIncomingAuthorized("did:vaultys:remote");
    expect(authorized).toBe(true);
  });

  it("rejects a matching grant whose certificate fails verification", async () => {
    const { pm, ownDid } = await makePeerManager();
    pm.setServerPublicKey(new Uint8Array([1, 2, 3]));
    pm.updatePeerCatalog([makeGrant(ownDid, { sourceDid: "did:vaultys:remote", certificate: "forged-cert" })]);
    const authorized = await (pm as any).isIncomingAuthorized("did:vaultys:remote");
    expect(authorized).toBe(false);
  });
});
