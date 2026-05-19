/**
 * GET    /api/users/unclaimed/[id]  — Get an unclaimed Entra user by internal ID.
 * PATCH  /api/users/unclaimed/[id]  — Update profile fields.
 * DELETE /api/users/unclaimed/[id]  — Remove the user.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDao } from "@/lib/user-dao";
import { getUserRealms } from "@/lib/db";

const VALID_ROLES = ["owner", "admin", "manager", "operator", "member"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const user = UserDao.getById(id);
  if (!user || user.did) {
    // Not found or already claimed — redirect callers to the normal route
    return NextResponse.json({ error: "User not found or already claimed" }, { status: 404 });
  }

  const realms = getUserRealms(user.id);

  return NextResponse.json({
    id: user.id,
    did: user.did,
    name: user.name,
    email: user.email,
    isOwner: user.is_owner === 1,
    isAdmin: user.is_admin === 1 || user.is_owner === 1,
    role: user.role ?? "member",
    reportsTo: user.reports_to ?? null,
    description: user.description ?? null,
    registeredAt: user.registered_at,
    entraId: user.entra_id ?? null,
    claimedAt: user.claimed_at ?? null,
    realms: realms.map((r) => ({
      id: r.realm_id,
      name: r.name,
      slug: r.slug,
      color: r.color,
      isPrimary: Boolean(r.is_primary),
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const user = UserDao.getById(id);
  if (!user || user.did) {
    return NextResponse.json({ error: "User not found or already claimed" }, { status: 404 });
  }

  const body = await req.json() as {
    name?: string;
    email?: string;
    role?: string;
    reportsTo?: string | null;
    description?: string | null;
  };

  const fields: Parameters<typeof UserDao.update>[1] = {};
  if (typeof body.name === "string") fields.name = body.name.trim();
  if (typeof body.email === "string") fields.email = body.email.trim();
  if (typeof body.description === "string" || body.description === null) {
    fields.description = typeof body.description === "string" ? body.description.trim() : null;
  }
  if (typeof body.role === "string") {
    if (!VALID_ROLES.includes(body.role as ValidRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    fields.role = body.role;
  }
  if ("reportsTo" in body) {
    fields.reports_to = body.reportsTo || null;
  }

  UserDao.update(user.id, fields);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const user = UserDao.getById(id);
  if (!user || user.did) {
    return NextResponse.json({ error: "User not found or already claimed" }, { status: 404 });
  }

  UserDao.removeById(id);
  return NextResponse.json({ ok: true });
}
