import { getAuthContext } from "@/lib/auth-utils";
import { UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { usersContract } from "@/lib/contracts";

/**
 * GET /api/users/admins — list global admins (name + email only).
 * Accessible to any authenticated user (used by the "contact admin" screen for
 * users not yet assigned to a realm).
 */
const handlers = createNextRoute(usersContract, {
  admins: async ({ request }) => {
    await getAuthContext(request); // throws UNAUTHORIZED if not logged in

    const { users } = await UserDAO.list({
      isAdmin: true,
      hasAccount: true,
      pageSize: 20,
      sortBy: "name",
      sortDir: "asc",
    });

    return {
      status: 200,
      body: {
        admins: users.map((u) => ({ name: u.name, email: u.email })),
      },
    };
  },
});

export const GET = handlers.GET!;
