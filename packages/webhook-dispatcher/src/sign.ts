import crypto from "node:crypto";

/**
 * Compute the webhook signature. Mirrors the Stripe/GitHub scheme: HMAC-SHA256
 * over `${timestamp}.${rawBody}`, hex-encoded and prefixed with `sha256=`.
 *
 * Receivers verify by recomputing this with their stored secret and the values
 * from the `X-VaultysClaw-Timestamp` header and the raw request body.
 */
export function sign(secret: string, timestamp: string, rawBody: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${timestamp}.${rawBody}`);
  return `sha256=${hmac.digest("hex")}`;
}
