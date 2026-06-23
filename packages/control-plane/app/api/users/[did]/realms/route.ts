/**
 * GET /api/users/[did]/realms — list realms the user belongs to, plus all
 * available realms. Admin only.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { RealmDAO, UserDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { usersContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(usersContract, {
  realms: async ({ params }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) throw new APIException("FORBIDDEN");

    const user =
      (await UserDAO.findByDid(params.did)) ??
      (await UserDAO.findById(params.did));
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    const [memberships, allRealms] = await Promise.all([
      RealmDAO.getUserRealms(user.id),
      RealmDAO.findAll(),
    ]);

    const memberRealmIds = new Set(memberships.map((m) => m.realmId));

    return {
      status: 200,
      body: {
        memberships: memberships.map((m) => ({
          realmId: m.realmId,
          realmName: m.realm.name,
          realmSlug: m.realm.slug,
          realmColor: m.realm.color,
          isDefault: m.realm.isDefault,
          isPrimary: m.isPrimary,
          isRealmAdmin: m.isRealmAdmin,
          joinedAt: m.joinedAt.toISOString(),
        })),
        available: allRealms
          .filter((r) => !memberRealmIds.has(r.id))
          .map((r) => ({ id: r.id, name: r.name, slug: r.slug, color: r.color })),
      },
    };
  },
});

export const GET = handlers.GET!;
