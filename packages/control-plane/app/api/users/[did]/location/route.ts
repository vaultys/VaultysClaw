/**
 * PATCH /api/users/[did]/location — set or clear a user's geographic location.
 * Global admin only.
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { UserDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.users, {
  setLocation: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const user =
      (await UserDAO.findByDid(params.did)) ??
      (await UserDAO.findById(params.did));
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    if (body.lat === null || body.lat === undefined) {
      await UserDAO.updateLocation(user.id, null);
    } else {
      if (body.lon === undefined) {
        throw new APIException("MALFORMED", "lon is required");
      }
      await UserDAO.updateLocation(user.id, {
        lat: body.lat,
        lon: body.lon,
        label: body.label ?? "",
      });
    }

    return { status: 200, body: undefined };
  },
});

export const PATCH = handlers.PATCH!;
