/**
 * GET    /api/users/[did]  — Get a single user (owner-only).
 * DELETE /api/users/[did]  — Remove a user and all their grants (owner-only).
 * PATCH  /api/users/[did]  — Update a user's name/email (owner-only).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDao } from "@/lib/user-dao";
import { GrantDao } from "@/lib/grant-dao";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { did } = await params;
  const user = UserDao.getByDid(did);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    did: user.did,
    name: user.name ?? null,
    email: user.email ?? null,
    isOwner: user.is_owner === 1,
    isAdmin: user.is_admin === 1 || user.is_owner === 1,
    registeredAt: user.registered_at,
    grants: GrantDao.listByUser(user.did).map((g) => ({
      id: g.id,
      agentDid: g.agent_did,
      capabilities: JSON.parse(g.capabilities) as string[],
      grantedBy: g.granted_by,
      expiresAt: g.expires_at,
      createdAt: g.created_at,
    })),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { did } = await params;

  if (did === session.user.did) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  const user = UserDao.getByDid(did);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  UserDao.remove(did);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { did } = await params;
  const user = UserDao.getByDid(did);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json() as { name?: string; email?: string };
  const fields: { name?: string; email?: string } = {};
  if (typeof body.name === "string") fields.name = body.name.trim();
  if (typeof body.email === "string") fields.email = body.email.trim();

  UserDao.update(did, fields);
  return NextResponse.json({ ok: true });
}
