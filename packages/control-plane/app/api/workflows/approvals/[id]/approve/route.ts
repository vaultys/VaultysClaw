import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import { workflowApprovalsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Route for POST /api/workflows/approvals/:id/approve.
 */
const handlers = createNextRoute(workflowApprovalsContract, {
  approve: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const updated = await WorkflowDAO.resolveApproval(
      params.id,
      auth.did,
      "approved",
      body.comment
    );
    if (!updated)
      throw new APIException("NOT_FOUND", "Approval not found or already decided");

    return { status: 200, body: { success: true } };
  },
});

export const POST = handlers.POST!;
