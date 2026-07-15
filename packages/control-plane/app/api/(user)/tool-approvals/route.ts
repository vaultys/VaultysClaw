import { getWSServer } from "@/lib/ws-server";
import { APIException } from "@/lib/api/utils/api-utils";
import { userContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/tool-approvals — `userContract.toolApprovals` (list + respond).
 * Any authenticated user may list/respond; the WebSocket server holds the
 * pending-approval state. The contract is the single source of truth.
 */
const handlers = createNextRoute(userContract.toolApprovals, {
  list: async ({ request }) => {

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not available");

    const approvals = wsServer.getPendingToolApprovals();
    return { status: 200, body: { approvals } };
  },

  respond: async ({ body, request }) => {

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not available");

    const ok = wsServer.respondToToolApproval(
      body.requestId,
      body.approved,
      body.reason
    );
    if (!ok)
      throw new APIException(
        "UNAVAILABLE",
        "Failed to process approval response"
      );

    return { status: 200, body: undefined };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
