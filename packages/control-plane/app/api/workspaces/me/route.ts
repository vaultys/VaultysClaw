import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { getAuthContext } from "@/lib/auth-utils";
import { WorkspaceDAO, UserDAO } from "@/db";

/**
 * Routes for /api/workspaces/me — the collection-level slice of `adminContract.workspaces`.
 *
 * The contract (lib/contracts/workspaces.contract.ts) is the single source of
 * truth for request/response shapes; `createNextRoute` validates inputs and
 * type-checks every `{ status, body }` returned below against it.
 */
const handlers = createNextRoute(adminContract.workspaces, {
  // ── GET /api/workspaces/me — list workspaces of the current user ────────────
  listMyWorkspaces: async ({ request }) => {
    const auth = await getAuthContext(request);

    const user = await UserDAO.findByDid(auth.did);
    const userId = user?.id ?? auth.did;

    const userWorkspaces = await WorkspaceDAO.getUserWorkspaces(userId);

    return { status: 200, body: { userWorkspaces } };
  },
});

export const GET = handlers.GET!;
