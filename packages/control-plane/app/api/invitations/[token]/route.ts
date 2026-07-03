/**
 * GET /api/invitations/[token]
 * Get invitation details (unauthenticated — for the email invite page).
 */

import { UserDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

const handlers = createNextRoute(adminContract.invitations, {
  get: async ({ params }) => {
    const invitation = await UserDAO.findInvitation(params.token);
    if (!invitation) throw new APIException("NOT_FOUND", "Invitation not found");

    if (new Date(invitation.expiresAt) < new Date())
      throw new APIException("FORBIDDEN", "Invitation expired");

    return {
      status: 200,
      body: {
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
      },
    };
  },
});

export const GET = handlers.GET!;
