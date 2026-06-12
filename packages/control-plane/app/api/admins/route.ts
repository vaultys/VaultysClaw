import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { UserDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * GET /api/admins
 * Returns basic contact info (name + email) for global admins.
 * Accessible to any authenticated user — used to show the "contact admin"
 * screen to users who are not yet assigned to a realm.
 */
export const GET = withError(async (request: Request) => {
  await getAuthContext(request); // throws UNAUTHORIZED if not logged in

  const { users } = await UserDAO.list({
    isAdmin: true,
    hasAccount: true,
    pageSize: 20,
    sortBy: "name",
    sortDir: "asc",
  });

  return NextResponse.json({
    admins: users.map((u) => ({
      name: u.name,
      email: u.email,
    })),
  });
});
