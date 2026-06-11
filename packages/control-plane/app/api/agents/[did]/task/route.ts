import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { agentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(agentsContract, {
  sendTask: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    const agentDid = params.did;

    if (!(await auth.canAccessAgent(agentDid))) throw new APIException("FORBIDDEN");

    const wsServer = getWSServer();
    if (!wsServer) throw new APIException("UNAVAILABLE", "WebSocket server not available");

    const ok = wsServer.sendTaskToAgent(agentDid, body.action, body.params ?? {});
    if (!ok) throw new APIException("UNAVAILABLE", "Agent not connected");

    return { status: 200, body: { agentId: agentDid, action: body.action } };
  },
});

export const POST = handlers.POST!;
