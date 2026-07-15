import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import {
  userContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Route for POST /api/workflows/approvals/:id/dismiss — dismiss a notification.
 */
const handlers = createNextRoute(userContract.workflowApprovals, {
  dismiss: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const updated = await WorkflowDAO.dismissNotification(params.id, auth.did);
    if (!updated)
      throw new APIException(
        "NOT_FOUND",
        "Notification not found or not dismissable"
      );

    return { status: 200, body: { success: true } };
  },
});

export const POST = handlers.POST!;
