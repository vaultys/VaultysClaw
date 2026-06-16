/**
 * Intent signature verification for the agent controller.
 *
 * Agents call verifyIntentMessage() on every incoming intent to confirm it was
 * signed by the control plane they authenticated against.
 *
 * Wire format (identical to delegation certs produced by control-plane):
 *   base64( 4-byte-LE-bodyLen | msgpack(body) | raw-signature )
 *
 * Body:
 *   { type: "intent", id: string, action: string, agentId: string, timestamp: number }
 */

import { VaultysId, crypto } from "@vaultys/id";
import { decode as msgpackDecode } from "@msgpack/msgpack";
import type { WSMessage } from "@vaultysclaw/shared";

const Buf = crypto.Buffer;

export interface IntentSigningBody {
  type: string;
  id: string;
  action: string;
  agentId: string;
  timestamp: number;
}

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
  console.log("boom");
  if (!message.signature) return false;

  try {
    const combined = Buf.from(message.signature, "base64");
    if (combined.length < 5) return false;

    const bodyLen = combined.readUInt32LE(0);
    if (combined.length < 4 + bodyLen) return false;

    const body = combined.subarray(4, 4 + bodyLen);
    const sig = combined.subarray(4 + bodyLen);


    const serverVid = VaultysId.fromId(serverPublicKey);
    console.log("Verifying intent signature with server public key:", serverVid.did);
    const valid = serverVid.verifyChallenge(
      Buf.from(body),
      Buf.from(sig),
      false
    );
    if (!valid) return false;

    const payload = msgpackDecode(body) as IntentSigningBody;
    if (payload.type !== "intent") return false;
    if (payload.id !== message.messageId) return false;
    if (payload.agentId !== message.agentId) return false;

    return true;
  } catch {
    return false;
  }
}
