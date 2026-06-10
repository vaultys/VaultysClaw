/**
 * Intent signing utilities.
 *
 * The control plane signs every intent it dispatches so the receiving agent
 * can verify it originated from the legitimate server (not a spoofed WS peer).
 *
 * Wire format (identical to delegation certs):
 *   base64( 4-byte-LE-bodyLen | msgpack(body) | raw-signature )
 *
 * Body:
 *   { type: "intent", id: string, action: string, agentId: string, timestamp: number }
 */

import { VaultysId, crypto } from "@vaultys/id";
import { encode as msgpackEncode } from "@msgpack/msgpack";
import { SettingsDAO } from "@/db";
import pino from "pino";

const logger = pino();
const Buf = crypto.Buffer;

export interface IntentSigningBody {
  type: "intent";
  id: string;
  action: string;
  agentId: string;
  timestamp: number;
}

/**
 * Sign an intent dispatch with the server's VaultysId.
 * Returns base64 token on success, null if the server identity is missing or
 * signing fails (non-fatal — the intent is still sent, just unsigned).
 */
export async function signIntent(
  intentId: string,
  action: string,
  agentId: string
): Promise<string | null> {
  try {
    const serverSecret = await SettingsDAO.get("serverSecret");
    if (!serverSecret) return null;

    const vid = VaultysId.fromSecret(serverSecret, "base64");

    const body: IntentSigningBody = {
      type: "intent",
      id: intentId,
      action,
      agentId,
      timestamp: Date.now(),
    };

    const bodyBuf = Buf.from(msgpackEncode(body));
    const signature = await vid.signChallenge(bodyBuf);

    const lenBuf = Buf.allocUnsafe(4);
    lenBuf.writeUInt32LE(bodyBuf.length, 0);
    const combined = Buf.concat([lenBuf, bodyBuf, Buf.from(signature)]);
    return combined.toString("base64");
  } catch (err) {
    logger.warn({ err }, "Failed to sign intent (non-fatal)");
    return null;
  }
}
