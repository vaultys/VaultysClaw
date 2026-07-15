/**
 * GET /api/admin/server/entra/unclaimed
 * List all Entra-provisioned users that have not yet claimed their account.
 * Admin-only.
 */

import { UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

const handlers = createNextRoute(adminContract.server, {
  entraUnclaimed: async () => {

    const users = (await UserDAO.listUnclaimed()).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      entraId: u.entraId,
      registeredAt: u.registeredAt,
      claimedAt: u.claimedAt,
    }));

    return { status: 200, body: { users } };
  },
});

export const GET = handlers.GET!;
