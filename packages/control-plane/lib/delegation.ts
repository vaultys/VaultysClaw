/**
 * Delegation certificate utilities (control-plane side).
 *
 * Delegation certs are server-signed blobs that prove a human user has been
 * granted a subset of an agent's capabilities by the server owner. The agent
 * controller verifies them offline using the server public key embedded in its
 * auth certificate (pk1).
 *
 * This module is a thin, DB-aware wrapper around the shared cert primitives in
 * `@vaultysclaw/policy`.
 */

import { VaultysId, crypto } from "@vaultys/id";
import { SettingsDAO } from "@/db";
import {
  signDelegationCert,
  verifyDelegationCert,
  type DelegationCertBody,
} from "@vaultysclaw/policy";

const Buffer = crypto.Buffer;

/** @deprecated Prefer importing `DelegationCertBody` from `@vaultysclaw/policy`. */
export type DelegationPayload = DelegationCertBody;

/**
 * Sign a delegation payload with the server's VaultysId.
 * Returns the base64 cert token (see `@vaultysclaw/policy` for the wire format).
 */
export async function signDelegation(
  userDid: string,
  agentDid: string,
  capabilities: string[],
  expiresAt?: Date
): Promise<string> {
  const serverSecret = await SettingsDAO.get("serverSecret");
  if (!serverSecret) throw new Error("Server identity not initialized");

  const vid = VaultysId.fromSecret(serverSecret, "base64");
  return signDelegationCert(vid, {
    userDid,
    agentDid,
    capabilities,
    ...(expiresAt ? { expiresAt: expiresAt.getTime() } : {}),
  });
}

/**
 * Verify a delegation certificate using the server's public key bytes.
 * Returns the decoded payload if valid (and not expired), null otherwise.
 *
 * @param cert  base64 string produced by signDelegation
 * @param serverPublicKey  raw public key bytes (from auth cert pk1 field)
 */
export async function verifyDelegation(
  cert: string,
  serverPublicKey: Buffer
): Promise<DelegationPayload | null> {
  try {
    const serverVid = VaultysId.fromId(serverPublicKey);
    return verifyDelegationCert(serverVid, cert);
  } catch {
    return null;
  }
}
