import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "./auth-config";
import {
  hashApiKey,
  isPublicRoute,
  matchRoute,
} from "./api/utils/api-key-utils";
import { AgentDAO, ApiKeyDAO, RealmDAO } from "@/db";
import { APIException } from "./api/utils/api-utils";

export interface AuthContext {
  did: string;
  /** Precomputed set of realm IDs the user can access. Empty for global admins (use isGlobalAdmin instead). */
  realmIds: Set<string>;
  isOwner: boolean;
  isGlobalAdmin: boolean;
  canAccessRealm(realmId: string): Promise<boolean>;
  canAdminRealm(realmId: string): Promise<boolean>;
  canAccessAgent(agentDid: string): Promise<boolean>;
  canAdminAgent(agentDid: string): Promise<boolean>;
}

/**
 * Resolve the auth context for a request, trying a NextAuth session first and
 * then an API key. Throws {@link APIException} with `UNAUTHORIZED` when neither
 * yields a valid identity — error handlers (`withError` / `createNextRoute`)
 * convert that into a 401, so route handlers can use the returned context
 * directly without a null check.
 */
export async function getAuthContext(
  request?: Request | NextRequest
): Promise<AuthContext> {
  // 1. Try NextAuth session first (unchanged behaviour)
  const session = await getServerSession(authOptions);
  if (session?.user?.did) {
    const { did, userId, isOwner, isAdmin } = session.user;
    const isGlobalAdmin = Boolean(isAdmin) || Boolean(isOwner);

    // Precompute realm membership once per request.
    // getUserRealms expects the DB UUID (userId), not the VaultysID DID string.
    const userRealms =
      isGlobalAdmin ? [] : await RealmDAO.getUserRealms(userId ?? did);
    const accessibleRealmIds = new Set(userRealms.map((r) => r.realmId));
    const adminRealmIds = new Set(
      userRealms.filter((r) => r.isRealmAdmin).map((r) => r.realmId)
    );

    return {
      did,
      realmIds: accessibleRealmIds,
      isOwner: Boolean(isOwner),
      isGlobalAdmin,

      async canAccessRealm(realmId: string): Promise<boolean> {
        return isGlobalAdmin || accessibleRealmIds.has(realmId);
      },

      async canAdminRealm(realmId: string): Promise<boolean> {
        return isGlobalAdmin || adminRealmIds.has(realmId);
      },

      async canAccessAgent(agentDid: string): Promise<boolean> {
        if (isGlobalAdmin) return true;
        const agentRealms = await AgentDAO.getRealms(agentDid);
        return agentRealms.some((r) => accessibleRealmIds.has(r.realmId));
      },

      async canAdminAgent(agentDid: string): Promise<boolean> {
        if (isGlobalAdmin) return true;
        const agentRealms = await AgentDAO.getRealms(agentDid);
        return agentRealms.some((r) => adminRealmIds.has(r.realmId));
      },
    };
  }

  // 2. Try API key authentication
  if (request) {
    const url = new URL(request.url);
    const method = request.method ?? "GET";
    const pathname = url.pathname;

    // Skip auth check for public routes
    if (isPublicRoute(method, pathname)) {
      throw new APIException("UNAUTHORIZED");
    }

    const rawKey =
      (request.headers.get("x-api-key") ?? "") ||
      (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

    if (rawKey) {
      const keyHash = hashApiKey(rawKey);
      const row = await ApiKeyDAO.findByHash(keyHash);

      if (!row || !row.isActive) throw new APIException("UNAUTHORIZED");

      // Check expiry
      if (row.expiresAt && row.expiresAt < new Date()) {
        throw new APIException("UNAUTHORIZED", "API key expired");
      }

      // Check route permission
      if (!matchRoute(method, pathname, row.allowedRoutes as string[])) {
        throw new APIException("FORBIDDEN", "API key not permitted for this route");
      }

      // Update last_used_at (fire-and-forget — don't fail auth on write error)
      ApiKeyDAO.updateLastUsed(row.id).catch(() => {});

      const realmId = row.realmId;
      const isRealmAdmin = row.isRealmAdmin;
      const isGlobalKey = realmId === null;

      return {
        did: `apikey:${row.id}`,
        realmIds: new Set<string>(),
        isOwner: false,
        isGlobalAdmin: isGlobalKey,

        async canAccessRealm(id: string): Promise<boolean> {
          return isGlobalKey || id === realmId;
        },

        async canAdminRealm(id: string): Promise<boolean> {
          return isGlobalKey || (id === realmId && isRealmAdmin);
        },

        async canAccessAgent(agentDid: string): Promise<boolean> {
          if (isGlobalKey) return true;
          const agentRealms = await AgentDAO.getRealms(agentDid);
          return agentRealms.some((r) => r.realmId === realmId);
        },

        async canAdminAgent(agentDid: string): Promise<boolean> {
          if (isGlobalKey) return true;
          if (!isRealmAdmin) return false;
          const agentRealms = await AgentDAO.getRealms(agentDid);
          return agentRealms.some((r) => r.realmId === realmId);
        },
      };
    }
  }

  throw new APIException("UNAUTHORIZED");
}
