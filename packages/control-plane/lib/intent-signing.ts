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
import { encode as msgpackEncode, decode as msgpackDecode } from "@msgpack/msgpack";
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

/**
 * Verify a base64 audit signature produced by {@link signIntent} against the
 * server's own VaultysId (re-derived from the stored `serverSecret`).
 *
 * Used by `GET /api/intents` to prove each audit record is non-repudiable.
 * Optionally cross-checks the signed body against the expected intent id /
 * action / agent so a signature lifted from another record can't be replayed.
 *
 * Returns `true` only if the signature is valid and (when provided) the body
 * matches; `false` on any decode/verify failure or missing server identity.
 */
export async function verifyIntentSignature(
  signature: string | null | undefined,
  expected?: { intentId?: string; action?: string; agentId?: string | null }
): Promise<boolean> {
  if (!signature) return false;
  try {
    const serverSecret = await SettingsDAO.get("serverSecret");
    if (!serverSecret) return false;
    const vid = VaultysId.fromSecret(serverSecret, "base64");

    const combined = Buf.from(signature, "base64");
    if (combined.length < 5) return false;
    const bodyLen = combined.readUInt32LE(0);
    if (combined.length < 4 + bodyLen) return false;
    const body = combined.subarray(4, 4 + bodyLen);
    const sig = combined.subarray(4 + bodyLen);

    const valid = vid.verifyChallenge(Buf.from(body), Buf.from(sig), false);
    if (!valid) return false;

    const payload = msgpackDecode(body) as IntentSigningBody;
    if (payload.type !== "intent") return false;
    if (expected?.intentId && payload.id !== expected.intentId) return false;
    if (expected?.action && payload.action !== expected.action) return false;
    if (
      expected?.agentId !== undefined &&
      expected.agentId !== null &&
      payload.agentId !== expected.agentId
    )
      return false;
    return true;
  } catch (err) {
    logger.warn({ err }, "Failed to verify intent signature");
    return false;
  }
}
