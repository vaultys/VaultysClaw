/**
 * GET    /api/users/[did]  — Get a single user (admin-only).
 * PATCH  /api/users/[did]  — Update a user's profile fields (owner-only).
 * DELETE /api/users/[did]  — Remove a user and all their grants (owner-only).
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { usersContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const VALID_ROLES = [
  "owner",
  "admin",
  "manager",
  "operator",
  "member",
] as const;

const handlers = createNextRoute(usersContract, {
  getOne: async ({ params }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) throw new APIException("FORBIDDEN");

    const user =
      (await UserDAO.findByDid(params.did)) ??
      (await UserDAO.findById(params.did));
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    return {
      status: 200,
      body: {
        id: user.id,
        did: user.did,
        name: user.name ?? null,
        email: user.email ?? null,
        isOwner: user.isOwner,
        isAdmin: user.isAdmin || user.isOwner,
        role: user.role ?? "member",
        reportsTo: user.reportsTo ?? null,
        description: user.description ?? null,
        registeredAt: user.registeredAt.toISOString(),
        locationLat: user.locationLat,
        locationLon: user.locationLon,
        locationLabel: user.locationLabel,
      },
    };
  },

  update: async ({ params, body }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isOwner) throw new APIException("FORBIDDEN");

    const user = await UserDAO.findByDid(params.did);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    const fields: Parameters<typeof UserDAO.update>[1] = {};
    if (typeof body.name === "string") fields.name = body.name.trim();
    if (typeof body.email === "string") fields.email = body.email.trim();
    if (typeof body.description === "string" || body.description === null) {
      fields.description =
        typeof body.description === "string" ? body.description.trim() : null;
    }
    if (typeof body.role === "string") {
      if (!VALID_ROLES.includes(body.role)) {
        throw new APIException("MALFORMED", "Invalid role");
      }
      if (!user.isOwner) fields.role = body.role;
    }
    if ("reportsTo" in body) {
      if (body.reportsTo === null || body.reportsTo === "") {
        fields.reportsTo = null;
      } else if (typeof body.reportsTo === "string") {
        if (body.reportsTo === params.did) {
          throw new APIException(
            "FORBIDDEN",
            "User cannot report to themselves"
          );
        }
        const supervisor = await UserDAO.findByDid(body.reportsTo);
        if (!supervisor) {
          throw new APIException("NOT_FOUND", "Supervisor user not found");
        }
        fields.reportsTo = body.reportsTo;
      }
    }

    await UserDAO.update(user.id, fields);
    return { status: 200, body: undefined };
  },

  remove: async ({ params }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isOwner) throw new APIException("FORBIDDEN");

    if (params.did === session.user.did) {
      throw new APIException("FORBIDDEN", "Cannot remove yourself");
    }

    const user = await UserDAO.findByDid(params.did);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    await UserDAO.delete(user.id);
    return { status: 200, body: undefined };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
