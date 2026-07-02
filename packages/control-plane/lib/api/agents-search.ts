import { getWSServer } from "@/lib/ws-server";
import { AgentDAO } from "@/db";
import type { AgentInfo, PaginatedResponse } from "@/lib/contracts";

/** Query params shared by the admin and user agent-search endpoints. */
export interface SearchAgentsParams {
  search?: string;
  online?: "true" | "false";
  workspace?: string;
  capabilities?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "name" | "lastSeen" | "registeredAt";
  sortDir?: "asc" | "desc";
}

/**
 * Paginated agent search, enriched with live WebSocket state.
 *
 * `workspaceIds` scopes the result set:
 *  - `undefined` → every agent (admin, global view)
 *  - a set of workspace ids → only agents in those workspaces (user, "my agents")
 */
export async function searchAgents(
  params: SearchAgentsParams,
  workspaceIds: Set<string> | undefined
): Promise<PaginatedResponse<AgentInfo>> {
  const {
    search,
    online: onlineParam,
    workspace,
    capabilities: capStr,
    page: rawPage,
    pageSize: rawPageSize,
    sortBy = "lastSeen",
    sortDir = "desc",
  } = params;

  const page = Math.max(1, rawPage ?? 1);
  const pageSize = Math.min(100, Math.max(1, rawPageSize ?? 20));
  const capabilities = capStr
    ? capStr
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : undefined;
  const onlineFilter =
    onlineParam === "true" ? true : onlineParam === "false" ? false : undefined;

  const wsServer = getWSServer();
  const connectedDids = new Set(
    wsServer?.getConnectedAgents().map((a) => a.id) ?? []
  );

  // Single DB call — workspace & online filters applied inside the DAO
  const result = await AgentDAO.query({
    search,
    workspace,
    capabilities,
    page,
    pageSize,
    sortBy,
    sortDir,
    workspaceIds,
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
    items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
}
