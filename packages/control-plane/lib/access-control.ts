import { isAdminRole, isOwnerRole } from "./roles";

/**
 * Pure access-control logic for the {@link ../proxy proxy middleware}.
 *
 * Kept free of `next-auth` / `next/server` imports so it can be unit-tested in
 * a plain Node environment.
 *
 * Access rules, evaluated in order:
 *   - public paths (see {@link publicPaths})       → everyone
 *   - authenticated OIDC user without a DID         → forced to /claim
 *   - /owner*                                       → Owner only
 *   - /admin*                                       → Admin or Owner
 *   - /app* and /api*                               → any authenticated user
 *                                                     (API routes enforce fine-grained perms)
 *   - anything else                                 → any authenticated user
 */

// Paths accessible without authentication.
export const publicPaths = [
  "/api/health",
  "/api/auth",
  "/api/user",
  "/api/server",
  "/api/test",
  "/api/workflows/test-seed",
  "/api/invitations",
  "/api/users/invite/email",
  "/api/users/invite/from-email",
  "/api/vaultys/",
  "/login",
  "/invite/",
  "/claim",
  "/",
  "/.well-known/vaultys.json",
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (publicPaths.some((p) => p !== "/" && pathname.startsWith(p))) return true;
  // Workflow execution endpoints (dynamic pattern)
  if (/^\/api\/workflows\/[^/]+\/execute$/.test(pathname)) return true;
  return false;
}

/** Minimal shape of the decoded session token the access logic depends on. */
export interface AccessToken {
  role?: string | null;
  did?: string | null;
}

export type AccessDecision =
  | { type: "next" }
  | { type: "redirect"; location: string };

/**
 * Pure access-control decision for a request. Returns either `next` (allow) or
 * a `redirect` with the target location (a path, possibly with a query string).
 */
export function resolveAccess(
  pathname: string,
  search: string,
  token: AccessToken | null
): AccessDecision {
  const role = token?.role;

  const loginRedirect = (): AccessDecision => ({
    type: "redirect",
    location: `/login?callbackUrl=${encodeURIComponent(pathname + search)}`,
  });

  // Authenticated user visiting /login → redirect to callbackUrl or home
  if (pathname.startsWith("/login") && token) {
    const callbackUrl = new URLSearchParams(search).get("callbackUrl") ?? "/";
    return { type: "redirect", location: callbackUrl };
  }

  // Public paths: allow everyone
  if (isPublicPath(pathname)) return { type: "next" };

  // Authenticated OIDC user without a DID must claim their VaultysId first.
  if (
    token &&
    !token.did &&
    pathname !== "/claim" &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/")
  ) {
    return { type: "redirect", location: "/claim" };
  }

  // /owner* — Owner only (area does not exist yet; rule defined ahead of time)
  if (pathname.startsWith("/owner")) {
    if (!token) return loginRedirect();
    if (!isOwnerRole(role)) return { type: "redirect", location: "/app" };
    return { type: "next" };
  }

  // /admin* — Admin or Owner only
  if (pathname.startsWith("/admin")) {
    if (!token) return loginRedirect();
    if (!isAdminRole(role)) return { type: "redirect", location: "/app" };
    return { type: "next" };
  }

  // /app* and /api* — any authenticated user (routes check their own rights)
  if (pathname.startsWith("/app") || pathname.startsWith("/api")) {
    if (!token) return loginRedirect();
    return { type: "next" };
  }

  // Anything else — require authentication
  if (!token) return loginRedirect();
  return { type: "next" };
}
