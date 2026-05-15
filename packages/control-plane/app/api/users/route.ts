/**
 * GET /api/users
 * List registered users with optional pagination and filters.
 *
 * Query params:
 *   q         – search by name, email, or DID (case-insensitive)
 *   role      – owner | admin | manager | operator | member
 *   isAdmin   – "true" | "false"
 *   realm     – realm id or slug
 *   page      – page number (default 1)
 *   pageSize  – items per page (default 20, max 100)
 *   sortBy    – name | email | registeredAt (default registeredAt)
 *   sortDir   – asc | desc (default asc)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDao } from "@/lib/user-dao";
import { GrantDao } from "@/lib/grant-dao";
import { getUserRealms } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const role = searchParams.get("role") ?? undefined;
  const realm = searchParams.get("realm") ?? undefined;
  const isAdminFilter = searchParams.get("isAdmin");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));
  const sortBy = (searchParams.get("sortBy") ?? "registeredAt") as "name" | "email" | "registeredAt";
  const sortDir = (searchParams.get("sortDir") ?? "asc") as "asc" | "desc";

  const isAdmin = isAdminFilter === "true" ? true : isAdminFilter === "false" ? false : undefined;

  const result = UserDao.query({ q, role, realm, isAdmin, page, pageSize, sortBy, sortDir });

  const users = result.users.map((u) => {
    const realms = getUserRealms(u.did);
    return {
      did: u.did,
      name: u.name ?? null,
      email: u.email ?? null,
      isOwner: u.is_owner === 1,
      isAdmin: u.is_admin === 1 || u.is_owner === 1,
      role: u.role,
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

  return NextResponse.json({
    users,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  });
}
