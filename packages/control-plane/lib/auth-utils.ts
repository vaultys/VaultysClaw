import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "./auth-config";
import {
  hashApiKey,
  isPublicRoute,
  matchRoute,
} from "./api/utils/api-key-utils";
import { AgentDAO, ApiKeyDAO, WorkspaceDAO } from "@/db";
import { APIException } from "./api/utils/api-utils";
import { isWorkspaceAdminRole, isWorkspaceOwnerRole } from "./roles";

export interface AuthContext {
  did: string;
  /** Precomputed set of workspace IDs the user can access. Empty for global admins (use isGlobalAdmin instead). */
  workspaceIds: Set<string>;
  isOwner: boolean;
  isGlobalAdmin: boolean;
  canAccessWorkspace(workspaceId: string): Promise<boolean>;
  canAdminWorkspace(workspaceId: string): Promise<boolean>;
  /** True when the user owns the workspace (workspace role Owner) or is a global admin. */
  canOwnWorkspace(workspaceId: string): Promise<boolean>;
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

    // Precompute workspace membership once per request.
    // getUserWorkspaces expects the DB UUID (userId), not the VaultysID DID string.
    const userWorkspaces = isGlobalAdmin
      ? []
      : await WorkspaceDAO.getUserWorkspaces(userId ?? did);
    const accessibleWorkspaceIds = new Set(userWorkspaces.map((r) => r.workspaceId));
    const adminWorkspaceIds = new Set(
      userWorkspaces
        .filter((r) => isWorkspaceAdminRole(r.role))
        .map((r) => r.workspaceId)
    );
    const ownerWorkspaceIds = new Set(
      userWorkspaces
        .filter((r) => isWorkspaceOwnerRole(r.role))
        .map((r) => r.workspaceId)
    );

    return {
      did,
      workspaceIds: accessibleWorkspaceIds,
      isOwner: Boolean(isOwner),
      isGlobalAdmin,

      async canAccessWorkspace(workspaceId: string): Promise<boolean> {
        return isGlobalAdmin || accessibleWorkspaceIds.has(workspaceId);
      },

      async canAdminWorkspace(workspaceId: string): Promise<boolean> {
        return isGlobalAdmin || adminWorkspaceIds.has(workspaceId);
      },

      async canOwnWorkspace(workspaceId: string): Promise<boolean> {
        return isGlobalAdmin || ownerWorkspaceIds.has(workspaceId);
      },

      async canAccessAgent(agentDid: string): Promise<boolean> {
        if (isGlobalAdmin) return true;
        const agentWorkspaces = await AgentDAO.getWorkspaces(agentDid);
        return agentWorkspaces.some((r) => accessibleWorkspaceIds.has(r.workspaceId));
      },

      async canAdminAgent(agentDid: string): Promise<boolean> {
        if (isGlobalAdmin) return true;
        const agentWorkspaces = await AgentDAO.getWorkspaces(agentDid);
        return agentWorkspaces.some((r) => adminWorkspaceIds.has(r.workspaceId));
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
        throw new APIException(
          "FORBIDDEN",
          "API key not permitted for this route"
        );
      }

      // Update last_used_at (fire-and-forget — don't fail auth on write error)
      ApiKeyDAO.updateLastUsed(row.id).catch(() => {});

      const workspaceId = row.workspaceId;
      const isWorkspaceAdmin = row.isWorkspaceAdmin;
      const isGlobalKey = workspaceId === null;

      return {
        did: `apikey:${row.id}`,
        workspaceIds: new Set<string>(),
        isOwner: false,
        isGlobalAdmin: isGlobalKey,

        async canAccessWorkspace(id: string): Promise<boolean> {
          return isGlobalKey || id === workspaceId;
        },

        async canAdminWorkspace(id: string): Promise<boolean> {
          return isGlobalKey || (id === workspaceId && isWorkspaceAdmin);
        },

        async canOwnWorkspace(_id: string): Promise<boolean> {
          // API keys never own a workspace; only a global key has full authority.
          return isGlobalKey;
        },

        async canAccessAgent(agentDid: string): Promise<boolean> {
          if (isGlobalKey) return true;
          const agentWorkspaces = await AgentDAO.getWorkspaces(agentDid);
          return agentWorkspaces.some((r) => r.workspaceId === workspaceId);
        },

        async canAdminAgent(agentDid: string): Promise<boolean> {
          if (isGlobalKey) return true;
          if (!isWorkspaceAdmin) return false;
          const agentWorkspaces = await AgentDAO.getWorkspaces(agentDid);
          return agentWorkspaces.some((r) => r.workspaceId === workspaceId);
        },
      };
    }
  }

  throw new APIException("UNAUTHORIZED");
}
