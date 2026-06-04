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
import { GrantDAO, RealmDAO, UserDAO } from "@/db";

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: List registered users with optional pagination and filters.
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search by name, email, or DID (case-insensitive).
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [owner, admin, manager, operator, member]
 *         description: Filter by user role.
 *       - in: query
 *         name: isAdmin
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: Filter by admin status.
 *       - in: query
 *         name: realm
 *         schema:
 *           type: string
 *         description: Filter by realm id or slug.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number.
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, email, registeredAt]
 *           default: registeredAt
 *         description: Sort by field.
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort direction.
 *     responses:
 *       200:
 *         description: A list of users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pageSize:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
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
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
  );
  const sortBy = (searchParams.get("sortBy") ?? "registeredAt") as
    | "name"
    | "email"
    | "registeredAt";
  const sortDir = (searchParams.get("sortDir") ?? "asc") as "asc" | "desc";

  const isAdmin =
    isAdminFilter === "true"
      ? true
      : isAdminFilter === "false"
        ? false
        : undefined;
  const hasAccountParam = searchParams.get("hasAccount");
  const hasAccount =
    hasAccountParam === "true"
      ? true
      : hasAccountParam === "false"
        ? false
        : undefined;

  const result = await UserDAO.list({
    q,
    role,
    realmId: realm,
    isAdmin,
    hasAccount,
    page,
    pageSize,
    sortBy,
    sortDir,
  });

  const users = await Promise.all(result.users.map(async (u) => {
    const realms = await RealmDAO.getUserRealms(u.id);
    const grants = u.did
      ? (await GrantDAO.listByUser(u.did)).map((g) => ({
          id: g.id,
          agentDid: g.agentDid,
          capabilities: g.capabilities as string[],
          grantedBy: g.grantedBy,
          expiresAt: g.expiresAt,
          createdAt: g.createdAt,
        }))
      : [];
    return {
      id: u.id,
      did: u.did,
      name: u.name ?? null,
      email: u.email ?? null,
      isOwner: Boolean(u.isOwner),
      isAdmin: Boolean(u.isAdmin) || Boolean(u.isOwner),
      role: u.role,
      registeredAt: u.registeredAt,
      entraId: u.entraId ?? null,
      claimedAt: u.claimedAt ?? null,
      realms: realms.map((r) => ({
        id: r.realm.id,
        name: r.realm.name,
        slug: r.realm.slug,
        color: r.realm.color,
        isPrimary: Boolean(r.isPrimary),
      })),
      grants,
    };
  }));

  return NextResponse.json({
    users,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  });
}
