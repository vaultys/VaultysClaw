/**
 * GET /api/users
 * List users (registered or unclaimed) with optional pagination and filters.
 * Admin only.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { WorkspaceDAO, UserDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { isAdminRole, normalizeRole } from "@/lib/roles";

const handlers = createNextRoute(adminContract.users, {
  list: async ({ query }) => {
    const session = await getServerSession(authOptions);
    if (!isAdminRole(session?.user?.role)) throw new APIException("FORBIDDEN");

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const hasAccount =
      query.hasAccount === "true"
        ? true
        : query.hasAccount === "false"
          ? false
          : undefined;

    const result = await UserDAO.list({
      q: query.q,
      role: query.role,
      workspaceId: query.workspace,
      hasAccount,
      page,
      pageSize,
      sortBy: query.sortBy ?? "registeredAt",
      sortDir: query.sortDir ?? "asc",
    });

    const users = await Promise.all(
      result.users.map(async (u) => {
        const workspaces = await WorkspaceDAO.getUserWorkspaces(u.id);
        return {
          id: u.id,
          did: u.did,
          name: u.name ?? null,
          email: u.email ?? null,
          role: normalizeRole(u.role),
          entraId: u.entraId ?? null,
          claimedAt: u.claimedAt ? u.claimedAt.toISOString() : null,
          registeredAt: u.registeredAt.toISOString(),
          workspaces,
        };
      })
    );

    return {
      status: 200,
      body: {
        users,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
    };
  },
});

export const GET = handlers.GET!;
