/**
 * GET /api/users/search?realm=[realmId]&q=[query]
 * List users in a realm with optional search by name/email.
 */

import { RealmDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { usersContract } from "@/lib/contracts";

const handlers = createNextRoute(usersContract, {
  search: async ({ query }) => {
    const realm = await RealmDAO.findById(query.realm);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    const q = query.q?.toLowerCase() ?? "";
    const realmUsers = await RealmDAO.getUsers(query.realm);

    const users = realmUsers
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
