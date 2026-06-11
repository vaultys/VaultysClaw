import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { AgentDAO, RealmDAO } from "@/db";
import { agentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(agentsContract, {
  list: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const {
      q,
      online: onlineParam,
      realm,
      capabilities: capStr,
      page: rawPage,
      pageSize: rawPageSize,
      sortBy = "lastSeen",
      sortDir = "desc",
    } = query;

    const page = Math.max(1, rawPage ?? 1);
    const pageSize = Math.min(100, Math.max(1, rawPageSize ?? 20));
    const capabilities = capStr
      ? capStr.split(",").map((c) => c.trim()).filter(Boolean)
      : undefined;
    const onlineFilter =
      onlineParam === "true" ? true : onlineParam === "false" ? false : undefined;

    const wsServer = getWSServer();
    const connectedDids = new Set(
      wsServer?.getConnectedAgents().map((a) => a.id) ?? []
    );

    // One query for user realm access (skipped for global admins)
    const userRealmIds = auth.isGlobalAdmin
      ? undefined
      : new Set((await RealmDAO.getUserRealms(auth.did)).map((r) => r.realmId));

    // Single DB call — realm & online filters applied inside the DAO
    const result = await AgentDAO.query({
      search: q,
      realm,
      capabilities,
      page,
      pageSize,
      sortBy,
      sortDir,
      realmIds: userRealmIds,
      onlineFilter,
      onlineDids: connectedDids,
    });

    // Enrich with live WS state — no extra DB calls needed (realms already included)
    const items = result.agents.map((agent) => {
      const connected = wsServer?.getAgent(agent.did);
      return {
        id: agent.did,
        name: connected?.name ?? agent.name,
        capabilities: agent.capabilities,
        registeredAt: agent.registeredAt instanceof Date
          ? agent.registeredAt.toISOString()
          : String(agent.registeredAt),
        lastSeen: agent.lastSeen instanceof Date
          ? agent.lastSeen.toISOString()
          : String(agent.lastSeen),
        online: connectedDids.has(agent.did),
        connectedAt: connected?.connectedAt?.toISOString() ?? null,
        lastHeartbeat: connected?.lastHeartbeat?.toISOString() ?? null,
        reportedLlm: (connected?.reportedLlm as { provider: string; model: string } | null | undefined) ?? null,
        tokenUsage: (connected?.tokenUsage as { promptTokens: number; completionTokens: number; totalTokens: number } | null | undefined) ?? null,
        transport: ((connected?.transport ?? null) as "ws" | "peerjs" | null),
        locationLat: agent.locationLat ?? null,
        locationLon: agent.locationLon ?? null,
        locationLabel: agent.locationLabel ?? null,
        realms: agent.agentRealms.map((ar) => ({
          id: ar.realm.id,
          name: ar.realm.name,
          slug: ar.realm.slug,
          color: ar.realm.color,
          isPrimary: ar.isPrimary,
        })),
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
        online: items.filter((a) => a.online).length,
      },
    };
  },
});

export const GET = handlers.GET!;
