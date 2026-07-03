/**
 * GET   /api/users/me — Return the current user's profile.
 * PATCH /api/users/me — Update the current user's own editable fields.
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";
import { normalizeRole } from "@/lib/roles";

const handlers = createNextRoute(adminContract.users, {
  // ── GET /api/users/me ─────────────────────────────────────────────────────
  me: async ({ request }) => {
    const auth = await getAuthContext(request);
    const user = await UserDAO.findByDid(auth.did);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    return {
      status: 200,
      body: {
        id: user.id,
        did: user.did,
        publicKey: user.publicKey ?? null,
        name: user.name ?? null,
        email: user.email ?? null,
        description: user.description ?? null,
        role: normalizeRole(user.role),
        entraId: user.entraId ?? null,
        locationLabel: user.locationLabel ?? null,
        registeredAt: user.registeredAt.toISOString(),
        claimedAt: user.claimedAt ? user.claimedAt.toISOString() : null,
      },
    };
  },

  // ── PATCH /api/users/me ───────────────────────────────────────────────────
  updateMe: async ({ body, request }) => {
    const auth = await getAuthContext(request);

    const update: Record<string, string | null> = {};
    if (body.name !== undefined) update.name = body.name.trim() || null;
    if (body.email !== undefined)
      update.email = body.email ? body.email.trim() || null : null;
    if (body.description !== undefined)
      update.description = body.description ? body.description.trim() || null : null;

    if (Object.keys(update).length === 0)
      throw new APIException("MALFORMED", "No updatable fields provided");

    await UserDAO.update(auth.did, update);

    const user = await UserDAO.findByDid(auth.did);
    return {
      status: 200,
      body: {
        ok: true,
        name: user?.name ?? null,
        email: user?.email ?? null,
        description: user?.description ?? null,
      },
    };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
