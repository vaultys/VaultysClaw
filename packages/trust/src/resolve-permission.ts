/**
 * The core ABAC decision function (docs/CERTIFICATE_WEB_OF_TRUST.md §3.6).
 *
 * Resolves whether a requested action is authorized by *any* of a Principal's
 * currently active certificates — a decision over a set, not a single implicit
 * policy. Pure: no I/O, no mutation, clock is injected.
 */
import type {
  CapabilityCertificateLite,
  PermissionDecision,
  RequestedAction,
} from "./types";

/** Matches `value` against a single-trailing-wildcard glob pattern, e.g. "file:///reports/*". */
function matchesPattern(pattern: string, value: string): boolean {
  if (!pattern.includes("*")) return pattern === value;
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(value);
}

/** Whether a certificate's scope (if any) matches the requested action's resource. */
function scopeMatches(
  scope: CapabilityCertificateLite["scope"],
  requestedResource: string | undefined
): boolean {
  const resource = scope?.resource;
  const resourcePattern = scope?.resourcePattern;
  if (!resource && !resourcePattern) return true; // unscoped — matches any resource
  if (requestedResource === undefined) return false; // scoped cert requires a resource to check
  if (resource && resource === requestedResource) return true;
  if (resourcePattern && matchesPattern(resourcePattern, requestedResource)) return true;
  return false;
}

/** Whether a certificate is currently usable at all, independent of the requested action. */
function isUsable(cert: CapabilityCertificateLite, now: number): boolean {
  if (cert.status !== "active") return false;
  if (cert.expiresAt !== null && cert.expiresAt <= now) return false;
  const maxUses = cert.scope?.maxUses;
  if (maxUses !== undefined && (cert.usedCount ?? 0) >= maxUses) return false;
  return true;
}

/**
 * Resolve whether `action` is authorized by any certificate in `activeCerts`.
 *
 * `activeCerts` should be every certificate held by the acting Principal — the caller
 * is not expected to pre-filter by status/expiry; this function does that itself so
 * the two invariants (revoking never grants more, adding never removes access) hold
 * regardless of what the caller passes in.
 */
export function resolvePermission(
  action: RequestedAction,
  activeCerts: CapabilityCertificateLite[],
  now: number = Date.now()
): PermissionDecision {
  for (const cert of activeCerts) {
    if (!isUsable(cert, now)) continue;
    if (!cert.capabilities.includes(action.capability)) continue;
    if (!scopeMatches(cert.scope, action.resource)) continue;
    return { allowed: true, grantingCertId: cert.id };
  }

  return {
    allowed: false,
    reason: action.resource
      ? `No active certificate grants '${action.capability}' for resource '${action.resource}'`
      : `No active certificate grants '${action.capability}'`,
  };
}
