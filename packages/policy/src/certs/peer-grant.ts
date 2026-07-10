/**
 * Peer-grant certs.
 *
 * Server-signed blobs authorizing one agent (sourceDid) to invoke another agent
 * (targetDid) as an LLM tool. Both sides verify offline using the server public
 * key, without a network round-trip.
 */
import type { VaultysId } from "@vaultys/id";
import { signCert, openCert } from "./sign";

export interface PeerGrantCertBody {
  type: "peer_grant";
  sourceDid: string;
  targetDid: string;
  targetName: string;
  skillDescription: string;
  capabilities: string[];
  issuedAt: number;
  expiresAt?: number;
}

export interface PeerGrantCertInput {
  sourceDid: string;
  targetDid: string;
  targetName: string;
  skillDescription: string;
  capabilities: string[];
  /** Expiry in ms since epoch; omitted means no expiry. */
  expiresAt?: number;
}

/** Sign a peer-grant payload with the server's VaultysId. */
export function signPeerGrantCert(
  vid: VaultysId,
  input: PeerGrantCertInput
): Promise<string> {
  const body: PeerGrantCertBody = {
    type: "peer_grant",
    sourceDid: input.sourceDid,
    targetDid: input.targetDid,
    targetName: input.targetName,
    skillDescription: input.skillDescription,
    capabilities: input.capabilities,
    issuedAt: Date.now(),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
  };
  return signCert(vid, body);
}

/**
 * Verify a peer-grant cert. Returns the decoded body if the signature is valid
 * and the cert has not expired, else `null`.
 */
export function verifyPeerGrantCert(
  vid: VaultysId,
  token: string
): PeerGrantCertBody | null {
  const payload = openCert(vid, token) as PeerGrantCertBody | null;
  if (!payload || payload.type !== "peer_grant") return null;
  if (payload.expiresAt && payload.expiresAt < Date.now()) return null;
  return payload;
}
