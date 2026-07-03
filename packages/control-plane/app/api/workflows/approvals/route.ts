import { getAuthContext } from "@/lib/auth-utils";
import { WorkflowDAO } from "@/db";
import {
  userContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Route for GET /api/workflows/approvals — approval items for the current user.
 */
const handlers = createNextRoute(userContract.workflowApprovals, {
  list: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const all = query.all === "1";
    const approvals = all
      ? await WorkflowDAO.getAllApprovalsForUser(auth.did)
      : await WorkflowDAO.getPendingApprovalsForUser(auth.did);

    return { status: 200, body: { approvals } };
  },
});

export const GET = handlers.GET!;
