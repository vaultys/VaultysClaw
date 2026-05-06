/**
 * GET   /api/users/me — Return the current user's profile.
 * PATCH /api/users/me — Update the current user's own name.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDao } from "@/lib/user-dao";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = UserDao.getByDid(session.user.did);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    did: user.did,
    name: user.name ?? null,
    isOwner: user.is_owner === 1,
    isAdmin: user.is_admin === 1 || user.is_owner === 1,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { name?: unknown };

  if (typeof body.name !== "string") {
    return NextResponse.json({ error: "name must be a string" }, { status: 400 });
  }

  const name = body.name.trim();
  if (name.length > 128) {
    return NextResponse.json({ error: "name must be 128 characters or fewer" }, { status: 400 });
  }

  UserDao.update(session.user.did, { name: name || "" });
  return NextResponse.json({ ok: true, name: name || null });
}
