import { UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

/**
 * GET /api/users/admins — list global admins (name + email only).
 * Accessible to any authenticated user (used by the "contact admin" screen for
 * users not yet assigned to a workspace).
 */
const handlers = createNextRoute(userContract.users, {
  admins: async ({ request }) => {

    const users = await UserDAO.listAdmins(20);

    return {
      status: 200,
      body: {
        admins: users.map((u) => ({ name: u.name, email: u.email })),
      },
    };
  },
});

export const GET = handlers.GET!;
