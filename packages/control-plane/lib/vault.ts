/**
 * Secret vault — encrypts and decrypts sensitive credentials
 * using the server's VaultysId identity (same key that signs policies,
 * delegates capabilities, etc.).
 *
 * Encryption: VaultysId.signcrypt(plaintext, [serverVid.id])
 *   → produces a ciphertext only the server can open
 *
 * Decryption: serverVid.decrypt(ciphertext)
 *
 * This means every encrypted secret is tied to the server's unique
 * non-transferable identity — no separate master-key management needed.
 */

import { VaultysId } from "@vaultys/id";
import { getSetting } from "./db";

// ---------------------------------------------------------------------------
// Server identity helpers  (same pattern as auth-handler.ts)
// ---------------------------------------------------------------------------

function getServerVaultysId(): VaultysId {
  const serverSecret = getSetting("serverSecret");
  if (!serverSecret) {
    throw new Error("Server VaultysId secret not configured (run the initial setup)");
  }
  return VaultysId.fromSecret(serverSecret, "base64");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext secret using the server's VaultysId.
 * Returns a signcrypt ciphertext (string) safe to store in the DB.
 */
export async function encryptSecret(plaintext: string): Promise<string> {
  const vid = getServerVaultysId();
  // signcrypt to self: only this server can decrypt
  const encrypted = await vid.signcrypt(plaintext, [vid.id]);
  return encrypted;
}

/**
 * Decrypt a secret previously encrypted with encryptSecret.
 * Throws if the ciphertext is tampered or the server secret has changed.
 */
export async function decryptSecret(ciphertext: string): Promise<string> {
  const vid = getServerVaultysId();
  return await vid.decrypt(ciphertext);
}

/**
 * Redact a value for safe logging — shows only first 4 chars.
 */
export function sanitizeForLog(value: string, show = 4): string {
  if (value.length <= show + 3) return "***";
  return value.slice(0, show) + "*".repeat(Math.max(3, value.length - show));
}
