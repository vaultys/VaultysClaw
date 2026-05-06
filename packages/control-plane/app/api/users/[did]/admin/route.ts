/**
 * PATCH /api/users/[did]/admin
 * Promote or demote a user to/from admin. Owner-only.
 * The owner cannot demote themselves.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDao } from "@/lib/user-dao";

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

  if (user.is_owner === 1) {
    return NextResponse.json({ error: "Cannot change the owner's admin status" }, { status: 400 });
  }

  const body = await req.json() as { isAdmin: boolean };
  if (typeof body.isAdmin !== "boolean") {
    return NextResponse.json({ error: "isAdmin must be a boolean" }, { status: 400 });
  }

  UserDao.setAdmin(did, body.isAdmin);
  return NextResponse.json({ ok: true });
}
