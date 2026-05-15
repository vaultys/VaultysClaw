import { getServerSession } from "next-auth";
import { authOptions } from "./auth-config";
import { getAgentRealms, getUserRealms, isUserInRealm, isUserRealmAdmin } from "./db";
import { NextResponse } from "next/server";

export interface AuthContext {
  did: string;
  isOwner: boolean;
  isGlobalAdmin: boolean;
  canAccessRealm(realmId: string): boolean;
  canAdminRealm(realmId: string): boolean;
  canAccessAgent(agentDid: string): boolean;
  canAdminAgent(agentDid: string): boolean;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) return null;

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
      const agentRealmIds = new Set(getAgentRealms(agentDid).map((r) => r.realm_id));
      return getUserRealms(did).some((r) => agentRealmIds.has(r.realm_id));
    },

    canAdminAgent(agentDid: string): boolean {
      if (isGlobalAdmin) return true;
      const agentRealmIds = new Set(getAgentRealms(agentDid).map((r) => r.realm_id));
      return getUserRealms(did).some(
        (r) => agentRealmIds.has(r.realm_id) && r.is_realm_admin === 1,
      );
    },
  };
}

export function forbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}
