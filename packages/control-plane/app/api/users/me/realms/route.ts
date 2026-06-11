/**
 * GET /api/users/me/realms — List the current user's realm memberships.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { RealmDAO, UserDAO } from "@/db";
import { notFound, unauthorized } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

export const GET = withError(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) {
    return unauthorized();
  }

  const user = await UserDAO.findByDid(session.user.did);
  if (!user) return notFound("User not found");

  const memberships = await RealmDAO.getUserRealms(user.id);

  return NextResponse.json({
    memberships: memberships.map((m) => ({
      realmId: m.realmId,
      realmName: m.realm.name,
      realmSlug: m.realm.slug,
      realmColor: m.realm.color ?? null,
      isDefault: m.realm.isDefault,
      isPrimary: m.isPrimary,
      isRealmAdmin: m.isRealmAdmin,
      joinedAt: m.joinedAt,
    })),
  });
});
