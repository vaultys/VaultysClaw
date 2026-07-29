/**
 * Intent signature verification for the agent controller.
 *
 * Agents call verifyIntentMessage() on every incoming intent to confirm it was
 * signed by the control plane they authenticated against.
 *
 * This is a thin wrapper around the shared cert primitives in
 * `@vaultysclaw/policy`.
 */

import { VaultysId } from "@vaultys/id";
import type { WSMessage } from "@vaultysclaw/shared";
import { verifyIntentCert, type IntentCertBody } from "@vaultysclaw/policy";

/** @deprecated Prefer importing `IntentCertBody` from `@vaultysclaw/policy`. */
export type IntentSigningBody = IntentCertBody;

/**
 * Verify a signed WSMessage of type "intent".
 *
 * @param message       The incoming WSMessage (must have `.signature`).
 * @param serverPublicKey  Raw public key bytes from the Challenger auth cert (pk1).
 * @returns `true` if the signature is valid and the body matches the envelope,
 *          `false` otherwise.
 */
export function verifyIntentMessage(
  message: WSMessage,
  serverPublicKey: Buffer
): boolean {
  if (!message.signature) return false;

  try {
    const serverVid = VaultysId.fromId(serverPublicKey);
    const payload = verifyIntentCert(serverVid, message.signature, {
      intentId: message.messageId,
    });
    if (!payload) return false;
    // Agent-side match is stricter than the server audit path: the signed
    // agentId must equal the envelope's agentId exactly (including when the
    // envelope omits it).
    if (payload.agentId !== message.agentId) return false;

    return true;
  } catch {
    return false;
  }
}
