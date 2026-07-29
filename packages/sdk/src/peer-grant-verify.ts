/**
 * Peer grant certificate verification for the agent controller.
 *
 * This is a thin wrapper around the shared cert primitives in
 * `@vaultysclaw/policy`. It verifies a server-signed peer-grant cert using the
 * server's raw public key bytes (available offline from the auth cert).
 */
import { VaultysId } from "@vaultys/id";
import {
  verifyPeerGrantCert,
  type PeerGrantCertBody,
} from "@vaultysclaw/policy";

/** @deprecated Prefer importing `PeerGrantCertBody` from `@vaultysclaw/policy`. */
export type PeerGrantPayload = PeerGrantCertBody;

/**
 * Verify a peer grant certificate using the server's raw public key bytes.
 * Returns the decoded payload if valid and not expired, null otherwise.
 */
export async function verifyPeerGrant(
  cert: string,
  serverPublicKey: Buffer
): Promise<PeerGrantPayload | null> {
  try {
    const serverVid = VaultysId.fromId(serverPublicKey);
    return verifyPeerGrantCert(serverVid, cert);
  } catch {
    return null;
  }
}
