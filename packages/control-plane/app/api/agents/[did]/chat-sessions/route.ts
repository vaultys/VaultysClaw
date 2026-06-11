import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { agentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(agentsContract, {
  getChatSessions: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    const { did } = params;

    if (!(await auth.canAccessAgent(did))) throw new APIException("FORBIDDEN");

    const wsServer = getWSServer();
    if (!wsServer) throw new APIException("UNAVAILABLE", "WebSocket server not available");

    try {
      const sessions = await wsServer.getChatSessions(did);
      return { status: 200, body: { sessions } };
    } catch (err) {
      throw new APIException(
        "UNAVAILABLE",
        err instanceof Error ? err.message : "Failed to fetch"
      );
    }
  },
});

export const GET = handlers.GET!;
