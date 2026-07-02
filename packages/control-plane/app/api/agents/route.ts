import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { AgentDAO } from "@/db";
import { agentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(agentsContract, {
  search: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const {
      search,
      online: onlineParam,
      workspace,
      mine,
      capabilities: capStr,
      page: rawPage,
      pageSize: rawPageSize,
      sortBy = "lastSeen",
      sortDir = "desc",
    } = query;

    const page = Math.max(1, rawPage ?? 1);
    const pageSize = Math.min(100, Math.max(1, rawPageSize ?? 20));
    const capabilities = capStr
      ? capStr
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : undefined;
    const onlineFilter =
      onlineParam === "true"
        ? true
        : onlineParam === "false"
          ? false
          : undefined;

    const wsServer = getWSServer();
    const connectedDids = new Set(
      wsServer?.getConnectedAgents().map((a) => a.id) ?? []
    );

    // Global admins see all agents, EXCEPT when `mine=true` (the "My Agents"
    // view) which always restricts to the caller's own workspaces.
    const userWorkspaceIds =
      auth.isGlobalAdmin && mine !== "true" ? undefined : auth.workspaceIds;

    // Single DB call — workspace & online filters applied inside the DAO
    const result = await AgentDAO.query({
      search,
      workspace,
      capabilities,
      page,
      pageSize,
      sortBy,
      sortDir,
      workspaceIds: userWorkspaceIds,
      onlineFilter,
      onlineDids: connectedDids,
    });

    // Enrich with live WS state — no extra DB calls needed (workspaces already included)
    const items = result.agents.map((agent) => {
      const connected = wsServer?.getAgent(agent.did);
      return {
        ...agent,
        online: connectedDids.has(agent.did),
        connectedAt: connected?.connectedAt ?? null,
        lastHeartbeat: connected?.lastHeartbeat ?? null,
        reportedLlm:
          (connected?.reportedLlm as
            | { provider: string; model: string }
            | null
            | undefined) ?? null,
        transport: (connected?.transport ?? null) as "ws" | "peerjs" | null,
      };
    });

    return {
      status: 200,
      body: {
        items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
    };
  },
});

export const GET = handlers.GET!;
