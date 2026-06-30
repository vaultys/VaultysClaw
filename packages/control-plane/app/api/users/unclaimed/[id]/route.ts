/**
 * GET    /api/users/unclaimed/[id]  — Get an unclaimed Entra user by internal ID.
 * PATCH  /api/users/unclaimed/[id]  — Update profile fields.
 * DELETE /api/users/unclaimed/[id]  — Remove the user.
 * Admin-only.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { RealmDAO, UserDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { usersContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { USER_ROLES, normalizeRole } from "@/lib/roles";

const handlers = createNextRoute(usersContract, {
  getUnclaimed: async ({ params }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) throw new APIException("FORBIDDEN");

    const user = await UserDAO.findById(params.id);
    if (!user || user.did) {
      throw new APIException("NOT_FOUND", "User not found or already claimed");
    }

    const realms = await RealmDAO.getUserRealms(user.id);

    return {
      status: 200,
      body: {
        id: user.id,
        did: user.did,
        name: user.name,
        email: user.email,
        role: normalizeRole(user.role),
        reportsTo: user.reportsTo ?? null,
        description: user.description ?? null,
        registeredAt: user.registeredAt.toISOString(),
        entraId: user.entraId ?? null,
        claimedAt: user.claimedAt ? user.claimedAt.toISOString() : null,
        realms,
      },
    };
  },

  updateUnclaimed: async ({ params, body }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) throw new APIException("FORBIDDEN");

    const user = await UserDAO.findById(params.id);
    if (!user || user.did) {
      throw new APIException("NOT_FOUND", "User not found or already claimed");
    }

    const fields: Parameters<typeof UserDAO.update>[1] = {};
    if (typeof body.name === "string") fields.name = body.name.trim();
    if (typeof body.email === "string") fields.email = body.email.trim();
    if (typeof body.description === "string" || body.description === null) {
      fields.description =
        typeof body.description === "string" ? body.description.trim() : null;
    }
    if (typeof body.role === "string") {
      if (!USER_ROLES.includes(body.role)) {
        throw new APIException("MALFORMED", "Invalid role");
      }
      fields.role = body.role;
    }
    if ("reportsTo" in body) {
      fields.reportsTo = body.reportsTo || null;
    }

    await UserDAO.update(user.id, fields);
    return { status: 200, body: undefined };
  },

  removeUnclaimed: async ({ params }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) throw new APIException("FORBIDDEN");

    const user = await UserDAO.findById(params.id);
    if (!user || user.did) {
      throw new APIException("NOT_FOUND", "User not found or already claimed");
    }

    await UserDAO.delete(params.id);
    return { status: 200, body: undefined };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
