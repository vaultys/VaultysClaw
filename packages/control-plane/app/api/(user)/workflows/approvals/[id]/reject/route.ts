import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import {
  userContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Route for POST /api/workflows/approvals/:id/reject.
 */
const handlers = createNextRoute(userContract.workflowApprovals, {
  reject: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const updated = await WorkflowDAO.resolveApproval(
      params.id,
      auth.did,
      "rejected",
      body.comment
    );
    if (!updated)
      throw new APIException("NOT_FOUND", "Approval not found or already decided");

    return { status: 200, body: { success: true } };
  },
});

export const POST = handlers.POST!;
