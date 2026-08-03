/**
 * Proactive-renewal eligibility (docs/CERTIFICATE_WEB_OF_TRUST.md §3.4/§3.6).
 *
 * Only standing (unscoped) certificates with a real expiry and a TTL above a
 * threshold are eligible for the control plane's proactive-renewal scan. Scoped,
 * short-lived grants are meant to expire and disappear — refreshing them silently
 * would defeat the point of issuing them narrowly in the first place. Certificates
 * with `expiresAt: null` have nothing to renew.
 */
import type { CapabilityCertificateLite } from "./types";

/** Below this TTL, a certificate is treated as ephemeral even if unscoped. */
export const DEFAULT_STANDING_TTL_THRESHOLD_MS = 5 * 60 * 1000;

export function isEligibleForProactiveRenewal(
  cert: Pick<CapabilityCertificateLite, "scope" | "issuedAt" | "expiresAt">,
  thresholdMs: number = DEFAULT_STANDING_TTL_THRESHOLD_MS
): boolean {
  if (cert.scope) return false;
  if (cert.expiresAt === null) return false;
  return cert.expiresAt - cert.issuedAt > thresholdMs;
}
