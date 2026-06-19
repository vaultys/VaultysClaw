import { getAuthContext } from "@/lib/auth-utils";
import { getWSServer } from "@/lib/ws-server";
import { APIException } from "@/lib/api/utils/api-utils";
import { toolApprovalsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/tool-approvals — `toolApprovalsContract` (list + respond).
 * Any authenticated user may list/respond; the WebSocket server holds the
 * pending-approval state. The contract is the single source of truth.
 */
const handlers = createNextRoute(toolApprovalsContract, {
  list: async ({ request }) => {
    await getAuthContext(request); // throws APIException("UNAUTHORIZED")

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not available");

    const approvals = wsServer.getPendingToolApprovals() as unknown as Array<
      Record<string, unknown>
    >;
    return { status: 200, body: { approvals } };
  },

  respond: async ({ body, request }) => {
    await getAuthContext(request);

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not available");

    const ok = wsServer.respondToToolApproval(
      body.requestId,
      body.approved,
      body.reason
    );
    if (!ok)
      throw new APIException("UNAVAILABLE", "Failed to process approval response");

    return { status: 200, body: undefined };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
