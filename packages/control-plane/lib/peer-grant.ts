/**
 * Agent peer-grant certificate utilities.
 *
 * Peer grants are server-signed blobs that authorise one agent (sourceDid)
 * to invoke another agent (targetDid) as an LLM tool.  The certificate can
 * be verified offline by both agents using the server public key already
 * embedded in their auth certificates (pk1 = server public key).
 *
 * Wire format (same as delegation.ts):
 *   base64( <4-byte-LE-body-len> | <msgpack-body> | <raw-signature> )
 *
 * Payload (msgpack-encoded):
 * {
 *   type: "peer_grant",
 *   sourceDid: string,
 *   targetDid: string,
 *   targetName: string,
 *   skillDescription: string,
 *   capabilities: string[],
 *   issuedAt: number,        // ms since epoch
 *   expiresAt?: number,      // ms since epoch
 * }
 */

import { encode as msgpackEncode, decode as msgpackDecode } from "@msgpack/msgpack";
import { VaultysId, crypto } from "@vaultys/id";
import { getSetting } from "./db";

const Buffer = crypto.Buffer;

export interface PeerGrantPayload {
  type: "peer_grant";
  sourceDid: string;
  targetDid: string;
  targetName: string;
  skillDescription: string;
  capabilities: string[];
  issuedAt: number;
  expiresAt?: number;
}

/**
 * Sign a peer grant with the server's VaultysId and return the base64 blob.
 */
export async function signPeerGrant(
  sourceDid: string,
  targetDid: string,
  targetName: string,
  skillDescription: string,
  capabilities: string[],
  expiresAt?: Date,
): Promise<string> {
  const serverSecret = getSetting("serverSecret");
  if (!serverSecret) throw new Error("Server identity not initialized");

  const vid = VaultysId.fromSecret(serverSecret, "base64");

  const payload: PeerGrantPayload = {
    type: "peer_grant",
    sourceDid,
    targetDid,
    targetName,
    skillDescription,
    capabilities,
    issuedAt: Date.now(),
    ...(expiresAt ? { expiresAt: expiresAt.getTime() } : {}),
  };

  const body = Buffer.from(msgpackEncode(payload));
  const signature = await vid.signChallenge(body);

  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32LE(body.length, 0);
  const combined = Buffer.concat([lenBuf, body, Buffer.from(signature)]);
  return combined.toString("base64");
}

/**
 * Verify a peer grant certificate using the server's raw public key bytes.
 * Returns the decoded payload if valid and not expired, null otherwise.
 */
export async function verifyPeerGrant(
  cert: string,
  serverPublicKey: Buffer,
): Promise<PeerGrantPayload | null> {
  try {
    const combined = Buffer.from(cert, "base64");
    if (combined.length < 5) return null;

    const bodyLen = combined.readUInt32LE(0);
    if (combined.length < 4 + bodyLen) return null;

    const body = combined.subarray(4, 4 + bodyLen);
    const signature = combined.subarray(4 + bodyLen);

    const serverVid = VaultysId.fromId(serverPublicKey);
    const valid = serverVid.verifyChallenge(Buffer.from(body), Buffer.from(signature), false);
    if (!valid) return null;

    const payload = msgpackDecode(body) as PeerGrantPayload;
    if (payload.type !== "peer_grant") return null;

    if (payload.expiresAt && payload.expiresAt < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}
