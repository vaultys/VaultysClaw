/**
 * Delegation certs.
 *
 * Server-signed blobs proving a human user has been granted a subset of an
 * agent's capabilities. The agent controller verifies them offline using the
 * server public key already embedded in its auth certificate (pk1).
 */
import type { VaultysId } from "@vaultys/id";
import { signCert, openCert } from "./sign";

export interface DelegationCertBody {
  type: "delegation";
  userDid: string;
  /** Target agent DID, or "*" to apply to all agents. */
  agentDid: string;
  capabilities: string[];
  issuedAt: number;
  expiresAt?: number;
}

export interface DelegationCertInput {
  userDid: string;
  agentDid: string;
  capabilities: string[];
  /** Expiry in ms since epoch; omitted means no expiry. */
  expiresAt?: number;
}

/** Sign a delegation payload with the server's VaultysId. */
export function signDelegationCert(
  vid: VaultysId,
  input: DelegationCertInput
): Promise<string> {
  const body: DelegationCertBody = {
    type: "delegation",
    userDid: input.userDid,
    agentDid: input.agentDid,
    capabilities: input.capabilities,
    issuedAt: Date.now(),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
  };
  return signCert(vid, body);
}

/**
 * Verify a delegation cert. Returns the decoded body if the signature is valid
 * and the cert has not expired, else `null`.
 */
export function verifyDelegationCert(
  vid: VaultysId,
  token: string
): DelegationCertBody | null {
  const payload = openCert(vid, token) as DelegationCertBody | null;
  if (!payload || payload.type !== "delegation") return null;
  if (payload.expiresAt && payload.expiresAt < Date.now()) return null;
  return payload;
}
