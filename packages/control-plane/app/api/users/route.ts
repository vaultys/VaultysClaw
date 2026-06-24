/**
 * GET /api/users
 * List users (registered or unclaimed) with optional pagination and filters.
 * Admin only.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { RealmDAO, UserDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { usersContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(usersContract, {
  list: async ({ query }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) throw new APIException("FORBIDDEN");

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const isAdmin =
      query.isAdmin === "true"
        ? true
        : query.isAdmin === "false"
          ? false
          : undefined;
    const hasAccount =
      query.hasAccount === "true"
        ? true
        : query.hasAccount === "false"
          ? false
          : undefined;

    const result = await UserDAO.list({
      q: query.q,
      role: query.role,
      realmId: query.realm,
      isAdmin,
      hasAccount,
      page,
      pageSize,
      sortBy: query.sortBy ?? "registeredAt",
      sortDir: query.sortDir ?? "asc",
    });

    const users = await Promise.all(
      result.users.map(async (u) => {
        const realms = await RealmDAO.getUserRealms(u.id);
        return {
          id: u.id,
          did: u.did,
          name: u.name ?? null,
          email: u.email ?? null,
          isOwner: Boolean(u.isOwner),
          isAdmin: Boolean(u.isAdmin) || Boolean(u.isOwner),
          role: u.role,
          entraId: u.entraId ?? null,
          claimedAt: u.claimedAt ? u.claimedAt.toISOString() : null,
          registeredAt: u.registeredAt.toISOString(),
          realms,
        };
      })
    );

    return {
      status: 200,
      body: {
        users,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
    };
  },
});

export const GET = handlers.GET!;
