import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { AgentDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { userAgentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * User-facing agent detail — GET /api/agents/:did (the `(user)` route group is
 * stripped from the path). Returns a lighter payload than the admin endpoint
 * (no workspace membership, no certificate) and gates access with
 * `canAccessAgent` rather than requiring global admin.
 */
const handlers = createNextRoute(userAgentsContract, {
  getAgent: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    const { did } = params;

    if (!(await auth.canAccessAgent(did))) {
      throw new APIException("FORBIDDEN");
    }

    const agent = await AgentDAO.findByDidWithUsage(did);
    if (!agent) {
      throw new APIException("NOT_FOUND", "Agent not found");
    }

    const connected = getWSServer()?.getAgent(did);

    return {
      status: 200,
      body: {
        ...agent,
        online: !!connected,
        connectedAt: connected?.connectedAt ?? null,
        lastHeartbeat: connected?.lastHeartbeat ?? null,
        reportedLlm: connected?.reportedLlm ?? null,
        transport: connected ? connected.transport : null,
      },
    };
  },
});

export const GET = handlers.GET!;
