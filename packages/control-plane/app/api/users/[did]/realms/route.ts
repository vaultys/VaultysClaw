/**
 * GET /api/users/[did]/realms — list realms the user belongs to, plus all available realms.
 * Requires global admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { RealmDAO, UserDAO } from "@/db";
import { forbidden, notFound } from "@/lib/api/utils/api-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return forbidden();
  }

  const { did } = await params;
  const user = (await UserDAO.findByDid(did)) ?? (await UserDAO.findById(did));
  if (!user) {
    return notFound("User not found");
  }

  const [memberships, allRealms] = await Promise.all([
    RealmDAO.getUserRealms(user.id),
    RealmDAO.findAll(),
  ]);

  const memberRealmIds = new Set(memberships.map((m) => m.realmId));

  return NextResponse.json({
    memberships: memberships.map((m) => ({
      realmId: m.realmId,
      realmName: m.realm.name,
      realmSlug: m.realm.slug,
      realmColor: m.realm.color,
      isDefault: m.realm.isDefault,
      isPrimary: m.isPrimary,
      isRealmAdmin: m.isRealmAdmin,
      joinedAt: m.joinedAt,
    })),
    available: allRealms
      .filter((r) => !memberRealmIds.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, slug: r.slug, color: r.color })),
  });
}
