import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.agents, {
  deleteSchedule: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    const { did, id } = params;

    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not available");

    const ok = wsServer.deleteScheduleOnAgent(did, id);
    if (!ok) throw new APIException("NOT_FOUND", "Agent not connected");

    return { status: 200, body: { agentId: did, scheduleId: id } };
  },
});

export const DELETE = handlers.DELETE!;
