import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.agents, {
  createSchedule: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    const agentDid = params.did;

    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not available");

    const ok = wsServer.sendScheduleToAgent(agentDid, {
      id: body.id,
      name: body.name,
      cron: body.cron,
      action: body.action,
      params: body.params ?? {},
      enabled: body.enabled !== false,
    });
    if (!ok) throw new APIException("NOT_FOUND", "Agent not connected");

    return { status: 200, body: { agentId: agentDid, scheduleId: body.id } };
  },
});

export const POST = handlers.POST!;
