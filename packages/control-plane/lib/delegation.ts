/**
 * Delegation certificate utilities.
 *
 * Delegation certs are server-signed JSON blobs that prove a human user has
 * been granted a subset of an agent's capabilities by the server owner.
 * The agent controller can verify them offline using the server public key
 * already embedded in its auth certificate (pk1 = server public key).
 *
 * Format (msgpack-encoded before signing):
 * {
 *   type: "delegation",
 *   userDid: string,
 *   agentDid: string,     // "*" = applies to all agents
 *   capabilities: string[],
 *   issuedAt: number,     // ms since epoch
 *   expiresAt?: number,   // ms since epoch, omitted if no expiry
 * }
 *
 * The signature covers the entire msgpack payload (no envelope).
 */

import {
  encode as msgpackEncode,
  decode as msgpackDecode,
} from "@msgpack/msgpack";
import { VaultysId, crypto } from "@vaultys/id";
import { getSetting } from "./db";

const Buffer = crypto.Buffer;

export interface DelegationPayload {
  type: "delegation";
  userDid: string;
  agentDid: string;
  capabilities: string[];
  issuedAt: number;
  expiresAt?: number;
}

/**
 * Sign a delegation payload with the server's VaultysId.
 * Returns base64(msgpack(payload) || base64url(signature)).
 *
 * Wire format:  base64( <4-byte-body-len> + <msgpack-body> + <raw-signature> )
 */
export async function signDelegation(
  userDid: string,
  agentDid: string,
  capabilities: string[],
  expiresAt?: Date
): Promise<string> {
  const serverSecret = getSetting("serverSecret");
  if (!serverSecret) throw new Error("Server identity not initialized");

  const vid = VaultysId.fromSecret(serverSecret, "base64");

  const payload: DelegationPayload = {
    type: "delegation",
    userDid,
    agentDid,
    capabilities,
    issuedAt: Date.now(),
    ...(expiresAt ? { expiresAt: expiresAt.getTime() } : {}),
  };

  const body = Buffer.from(msgpackEncode(payload));
  const signature = await vid.signChallenge(body);

  // Pack as: 4-byte LE body length | body | signature
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32LE(body.length, 0);
  const combined = Buffer.concat([lenBuf, body, Buffer.from(signature)]);
  return combined.toString("base64");
}

/**
 * Verify a delegation certificate using the server's public key bytes.
 * Returns the decoded payload if valid, null otherwise.
 *
 * @param cert  base64 string produced by signDelegation
 * @param serverPublicKey  raw public key bytes (from auth cert pk1 field)
 */
export async function verifyDelegation(
  cert: string,
  serverPublicKey: Buffer
): Promise<DelegationPayload | null> {
  try {
    const combined = Buffer.from(cert, "base64");
    if (combined.length < 5) return null;

    const bodyLen = combined.readUInt32LE(0);
    if (combined.length < 4 + bodyLen) return null;

    const body = combined.subarray(4, 4 + bodyLen);
    const signature = combined.subarray(4 + bodyLen);

    const serverVid = VaultysId.fromId(serverPublicKey);
    const valid = serverVid.verifyChallenge(
      Buffer.from(body),
      Buffer.from(signature),
      false
    );
    if (!valid) return null;

    const payload = msgpackDecode(body) as DelegationPayload;
    if (payload.type !== "delegation") return null;

    // Check expiry
    if (payload.expiresAt && payload.expiresAt < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}
