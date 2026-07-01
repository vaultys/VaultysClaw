/**
 * GET /api/users/search?workspace=[workspaceId]&q=[query]
 * List users in a workspace with optional search by name/email.
 */

import { WorkspaceDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { usersContract } from "@/lib/contracts";

const handlers = createNextRoute(usersContract, {
  search: async ({ query }) => {
    const workspace = await WorkspaceDAO.findById(query.workspace);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    const q = query.q?.toLowerCase() ?? "";
    const workspaceUsers = await WorkspaceDAO.getUsers(query.workspace);

    const users = workspaceUsers
      .filter((row) => {
        if (!q) return true;
        const name = (row.user.name || "").toLowerCase();
        const email = (row.user.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .map((row) => ({
        // Use the DID as the canonical id — matches session.user.did used by
        // the workflow-approvals inbox. Fall back to userId for legacy accounts.
        id: row.user.did ?? row.userId,
        name: row.user.name || "Unknown",
        email: row.user.email || "No email",
        joinedAt: new Date(row.joinedAt).toISOString(),
      }));

    return { status: 200, body: { users } };
  },
});

export const GET = handlers.GET!;
