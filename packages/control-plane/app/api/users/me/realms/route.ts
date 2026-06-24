/**
 * GET /api/users/me/realms — List the current user's realm memberships.
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { RealmDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { usersContract } from "@/lib/contracts";

const handlers = createNextRoute(usersContract, {
  meRealms: async ({ request }) => {
    const auth = await getAuthContext(request);
    const user = await UserDAO.findByDid(auth.did);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    const memberships = await RealmDAO.getUserRealms(user.id);

    return {
      status: 200,
      body: {
        memberships: memberships.map((m) => ({
          realmId: m.realmId,
          realmName: m.realm.name,
          realmSlug: m.realm.slug,
          realmColor: m.realm.color ?? null,
          isDefault: m.realm.isDefault,
          isPrimary: m.isPrimary,
          isRealmAdmin: m.isRealmAdmin,
          joinedAt: m.joinedAt.toISOString(),
        })),
      },
    };
  },
});

export const GET = handlers.GET!;
