/**
 * POST /api/public/invitations/[token]/delete
 * Delete an invitation after it's been successfully claimed.
 * Unauthenticated — called after a successful wallet connection.
 */

import { UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { publicContract } from "@/lib/contracts";

const handlers = createNextRoute(publicContract.invitations, {
  delete: async ({ params }) => {
    await UserDAO.deleteInvitation(params.token);
    return { status: 200, body: { success: true } };
  },
});

export const POST = handlers.POST!;
