import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "./auth-config";
import {
  getAgentRealms,
  getDb,
  getUserRealms,
  isUserInRealm,
  isUserRealmAdmin,
} from "./db";
import { NextResponse } from "next/server";
import { hashApiKey, isPublicRoute, matchRoute } from "./api-key-utils";

export interface AuthContext {
  did: string;
  isOwner: boolean;
  isGlobalAdmin: boolean;
  canAccessRealm(realmId: string): boolean;
  canAdminRealm(realmId: string): boolean;
  canAccessAgent(agentDid: string): boolean;
  canAdminAgent(agentDid: string): boolean;
}

interface ApiKeyRow {
  id: string;
  allowed_routes: string;
  realm_id: string | null;
  is_realm_admin: number;
  expires_at: number | null;
}

export async function getAuthContext(
  request?: Request | NextRequest
): Promise<AuthContext | null> {
  // 1. Try NextAuth session first (unchanged behaviour)
  const session = await getServerSession(authOptions);
  if (session?.user?.did) {
    const { did, isOwner, isAdmin } = session.user;
    const isGlobalAdmin = Boolean(isAdmin) || Boolean(isOwner);

    return {
      did,
      isOwner: Boolean(isOwner),
      isGlobalAdmin,

      canAccessRealm(realmId: string): boolean {
        return isGlobalAdmin || isUserInRealm(did, realmId);
      },

      canAdminRealm(realmId: string): boolean {
        return isGlobalAdmin || isUserRealmAdmin(did, realmId);
      },

      canAccessAgent(agentDid: string): boolean {
        if (isGlobalAdmin) return true;
        const agentRealmIds = new Set(
          getAgentRealms(agentDid).map((r) => r.realm_id)
        );
        return getUserRealms(did).some((r) => agentRealmIds.has(r.realm_id));
      },

      canAdminAgent(agentDid: string): boolean {
        if (isGlobalAdmin) return true;
        const agentRealmIds = new Set(
          getAgentRealms(agentDid).map((r) => r.realm_id)
        );
        return getUserRealms(did).some(
          (r) => agentRealmIds.has(r.realm_id) && r.is_realm_admin === 1
        );
      },
    };
  }

  // 2. Try API key authentication
  if (request) {
    const url = new URL(request.url);
    const method = request.method ?? "GET";
    const pathname = url.pathname;

    // Skip auth check for public routes
    if (isPublicRoute(method, pathname)) return null;

    const rawKey =
      (request.headers.get("x-api-key") ?? "") ||
      (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

    if (rawKey) {
      const keyHash = hashApiKey(rawKey);
      const db = getDb();
      const row = db
        .prepare(
          `SELECT id, allowed_routes, realm_id, is_realm_admin, expires_at
           FROM api_keys
           WHERE key_hash = ? AND is_active = 1`
        )
        .get(keyHash) as ApiKeyRow | undefined;

      if (!row) return null;

      // Check expiry
      if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000))
        return null;

      // Check route permission
      const allowedRoutes: string[] = JSON.parse(row.allowed_routes);
      if (!matchRoute(method, pathname, allowedRoutes)) return null;

      // Update last_used_at (fire-and-forget — don't fail auth on write error)
      try {
        db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(
          Math.floor(Date.now() / 1000),
          row.id
        );
      } catch {
        // non-critical
      }

      const realmId = row.realm_id;
      const isRealmAdmin = row.is_realm_admin === 1;
      const isGlobalKey = realmId === null;

      return {
        did: `apikey:${row.id}`,
        isOwner: false,
        isGlobalAdmin: isGlobalKey,

        canAccessRealm(id: string): boolean {
          return isGlobalKey || id === realmId;
        },

        canAdminRealm(id: string): boolean {
          return isGlobalKey || (id === realmId && isRealmAdmin);
        },

        canAccessAgent(agentDid: string): boolean {
          if (isGlobalKey) return true;
          return getAgentRealms(agentDid).some((r) => r.realm_id === realmId);
        },

        canAdminAgent(agentDid: string): boolean {
          if (isGlobalKey) return true;
          if (!isRealmAdmin) return false;
          return getAgentRealms(agentDid).some((r) => r.realm_id === realmId);
        },
      };
    }
  }

  return null;
}

export function forbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}
