/**
 * Peer grant certificate verification for the agent controller.
 *
 * Mirrors the control-plane's peer-grant.ts but uses only the agent's
 * available imports (no server-side dependencies).
 */
import { decode as msgpackDecode } from "@msgpack/msgpack";
import { VaultysId, crypto } from "@vaultys/id";

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
 * Verify a peer grant certificate using the server's raw public key bytes.
 * Returns the decoded payload if valid and not expired, null otherwise.
 */
export async function verifyPeerGrant(
  cert: string,
  serverPublicKey: Buffer
): Promise<PeerGrantPayload | null> {
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

    const payload = msgpackDecode(body) as PeerGrantPayload;
    if (payload.type !== "peer_grant") return null;

    if (payload.expiresAt && payload.expiresAt < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}
