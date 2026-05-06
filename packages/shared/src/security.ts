/**
 * Security utilities using VaultysId for decentralized identity and verification
 */

import { VaultysId, type Challenger } from "@vaultys/id";

/**
 * Verify a VaultysId challenge-response protocol context.
 * Returns true if the protocol is "p2p" and the service is "register" or "auth".
 */
export function verifyProtocol(challenger: Challenger): boolean {
  const { protocol, service } = challenger.getContext();
  return protocol === "p2p" && (service === "register" || service === "auth");
}

/**
 * Check if an agent controller has a specific capability
 * using the signed policy from control plane
 */
export function hasCapability(
  capability: string,
  policy: { capabilities?: string[] }
): boolean {
  return policy.capabilities?.includes(capability) ?? false;
}
