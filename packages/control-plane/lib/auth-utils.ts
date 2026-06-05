import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "./auth-config";
import { NextResponse } from "next/server";
import { hashApiKey, isPublicRoute, matchRoute } from "./api-key-utils";
import { AgentDAO, ApiKeyDAO, RealmDAO } from "@/db";

export interface AuthContext {
  did: string;
  isOwner: boolean;
  isGlobalAdmin: boolean;
  canAccessRealm(realmId: string): Promise<boolean>;
  canAdminRealm(realmId: string): Promise<boolean>;
  canAccessAgent(agentDid: string): Promise<boolean>;
  canAdminAgent(agentDid: string): Promise<boolean>;
}

export async function getAuthContext(
  request?: Request | NextRequest
): Promise<AuthContext | null> {
  // 1. Try NextAuth session first (unchanged behaviour)
  const session = await getServerSession(authOptions);
  if (session?.user?.did) {
    const { did, isOwner, isAdmin } = session.user;
    const isGlobalAdmin = Boolean(isAdmin) || Boolean(isOwner);

    // Precompute realm membership once per request
    const userRealms = isGlobalAdmin ? [] : await RealmDAO.getUserRealms(did);
    const accessibleRealmIds = new Set(userRealms.map((r) => r.realmId));
    const adminRealmIds = new Set(
      userRealms.filter((r) => r.isRealmAdmin).map((r) => r.realmId)
    );

    return {
      did,
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
    if (isPublicRoute(method, pathname)) return null;

    const rawKey =
      (request.headers.get("x-api-key") ?? "") ||
      (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

    if (rawKey) {
      const keyHash = hashApiKey(rawKey);
      const row = await ApiKeyDAO.findByHash(keyHash);

      if (!row || !row.isActive) return null;

      // Check expiry
      if (row.expiresAt && row.expiresAt < new Date()) return null;

      // Check route permission
      if (!matchRoute(method, pathname, row.allowedRoutes as string[]))
        return null;

      // Update last_used_at (fire-and-forget — don't fail auth on write error)
      ApiKeyDAO.updateLastUsed(row.id).catch(() => {});

      const realmId = row.realmId;
      const isRealmAdmin = row.isRealmAdmin;
      const isGlobalKey = realmId === null;

      return {
        did: `apikey:${row.id}`,
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

  return null;
}

export function forbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

export function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export function malformed(): NextResponse {
  return NextResponse.json({ error: "Malformed request" }, { status: 400 });
}