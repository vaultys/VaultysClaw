/**
 * PATCH /api/users/[did]/admin — promote or demote a user to/from admin.
 * Owner only.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { usersContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(usersContract, {
  setAdmin: async ({ params, body }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isOwner) throw new APIException("FORBIDDEN");

    const user = await UserDAO.findByDid(params.did);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    if (user.isOwner) {
      throw new APIException("FORBIDDEN", "Cannot change the owner's admin status");
    }

    await UserDAO.update(user.id, { isAdmin: body.isAdmin });
    return { status: 200, body: undefined };
  },
});

export const PATCH = handlers.PATCH!;
