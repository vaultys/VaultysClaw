/**
 * Secret vault — encrypts and decrypts sensitive credentials using the
 * control plane's own VaultysId (the same identity that signs every
 * certificate). Reused unchanged from packages/control-plane per
 * docs/REBUILD_ARCHITECTURE.md §3 ("kept, mostly unchanged").
 *
 * Encryption: VaultysId.signcrypt(plaintext, [serverVid.id]) — ciphertext
 * only the server can open. Decryption: serverVid.decrypt(ciphertext).
 */
import { ServerIdentityDAO } from "@/db";

export async function encryptSecret(plaintext: string): Promise<string> {
  const vid = await ServerIdentityDAO.getServerVaultysId();
  return await vid.signcrypt(plaintext, [vid.id]);
}

export async function decryptSecret(ciphertext: string): Promise<string> {
  const vid = await ServerIdentityDAO.getServerVaultysId();
  return await vid.decrypt(ciphertext);
}

export function sanitizeForLog(value: string, show = 4): string {
  if (value.length <= show + 3) return "***";
  return value.slice(0, show) + "*".repeat(Math.max(3, value.length - show));
}
