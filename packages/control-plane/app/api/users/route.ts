/**
 * GET /api/users
 * List all registered human users (owner-only).
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDao } from "@/lib/user-dao";
import { GrantDao } from "@/lib/grant-dao";
import { getUserRealms } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = UserDao.list().map((u) => {
    const realms = getUserRealms(u.did);
    return {
      did: u.did,
      name: u.name ?? null,
      email: u.email ?? null,
      isOwner: u.is_owner === 1,
      isAdmin: u.is_admin === 1 || u.is_owner === 1,
      registeredAt: u.registered_at,
      realms: realms.map((r) => ({
        id: r.realm_id, name: r.name, slug: r.slug,
        color: r.color, isPrimary: Boolean(r.is_primary),
      })),
      grants: GrantDao.listByUser(u.did).map((g) => ({
        id: g.id,
        agentDid: g.agent_did,
        capabilities: JSON.parse(g.capabilities) as string[],
        grantedBy: g.granted_by,
        expiresAt: g.expires_at,
        createdAt: g.created_at,
      })),
    };
  });

  return NextResponse.json({ users });
}
