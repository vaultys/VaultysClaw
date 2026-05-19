/**
 * GET /api/server/entra/unclaimed
 * List all Entra-provisioned users that have not yet claimed their account.
 * Admin-only.
 */

import { NextResponse } from "next/server";
import { getAuthContext, forbidden, unauthorized } from "@/lib/auth-utils";
import { UserDao } from "@/lib/user-dao";

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const users = UserDao.listUnclaimedEntra().map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    entraId: u.entra_id,
    registeredAt: u.registered_at,
  }));

  return NextResponse.json({ users });
}
