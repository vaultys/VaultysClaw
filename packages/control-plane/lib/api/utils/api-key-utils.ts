import crypto from "crypto";
import type { ApiKey as PrismaApiKey } from "@prisma/client";
import type { ApiKey } from "./api-types";

/** Serialize a Prisma ApiKey row to the API shape (unix-second timestamps). */
export function toApiKey(row: PrismaApiKey): ApiKey {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    allowedRoutes: row.allowedRoutes as string[],
    workspaceId: row.workspaceId ?? null,
    isWorkspaceAdmin: row.isWorkspaceAdmin,
    createdBy: row.createdBy,
    createdAt: Math.floor(row.createdAt.getTime() / 1000),
    lastUsedAt: row.lastUsedAt ? Math.floor(row.lastUsedAt.getTime() / 1000) : null,
    expiresAt: row.expiresAt ? Math.floor(row.expiresAt.getTime() / 1000) : null,
    isActive: row.isActive,
  };
}

/**
 * Generate a new API key in the format vc_key_<32 base62 chars>
 * Returns both the raw key (shown once to the user) and its SHA-256 hash (stored in DB).
 */
export function generateApiKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(32);
  let random = "";
  for (const b of bytes) {
    random += chars[b % chars.length];
  }
  const key = `vc_key_${random}`;
  const hash = hashApiKey(key);
  const prefix = `vc_key_${random.slice(0, 8)}`;
  return { key, hash, prefix };
}

/**
 * Compute a SHA-256 hex digest of an API key.
 * Used both when creating (to store) and when authenticating (to look up).
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Routes that never require any authentication (session or API key).
 */
export function isPublicRoute(method: string, pathname: string): boolean {
  const publicPaths = ["/api/health", "/api/setup/status", "/api/about"];
  if (publicPaths.includes(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  return false;
}

/**
 * Check whether a given HTTP method + pathname is covered by an allowedRoutes list.
 *
 * Each entry in allowedRoutes is a string like "GET /api/agents/[did]".
 * Path segments enclosed in [...] are treated as single-segment wildcards.
 *
 * Example: "GET /api/agents/[did]" matches "GET /api/agents/did:key:abc123"
 */
export function matchRoute(
  method: string,
  pathname: string,
  allowedRoutes: string[]
): boolean {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath =
    pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;

  for (const entry of allowedRoutes) {
    const spaceIdx = entry.indexOf(" ");
    if (spaceIdx === -1) continue;
    const entryMethod = entry.slice(0, spaceIdx).toUpperCase();
    const entryPath = entry.slice(spaceIdx + 1);

    if (entryMethod !== normalizedMethod) continue;

    // Convert Next.js route segments [param] to a regex segment that matches
    // any non-empty, non-slash sequence.
    const regexStr =
      "^" +
      entryPath
        .replace(/[.+?^${}()|\\]/g, "\\$&") // escape regex special chars (not [ ] * /)
        .replace(/\[([^\]]+)\]/g, "[^/]+") // [param] → one segment wildcard
        .replace(/\*/g, ".*") + // * → anything (for future glob use)
      "(/.*)?$"; // allow optional trailing segments

    if (new RegExp(regexStr).test(normalizedPath)) return true;
  }
  return false;
}
