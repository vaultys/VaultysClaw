import crypto from "crypto";

/** Generate a new HMAC signing secret: whsec_<64 hex chars>. */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString("hex")}`;
}

/** A short, non-reversible preview of the signing secret for list views — the
 *  full value is only ever shown once, right after create/regenerate. */
export function secretPreview(secret: string): string {
  if (!secret) return "";
  return `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}
