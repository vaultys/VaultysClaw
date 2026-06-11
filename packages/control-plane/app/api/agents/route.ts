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
      online: onlineFilter,
      realm,
      capabilities: capStr,
      page: rawPage,
      pageSize: rawPageSize,
      sortBy = "lastSeen",
      sortDir = "desc",
    } = query;

    const capabilities = capStr
      ? capStr
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : undefined;
    const page = Math.max(1, rawPage ?? 1);
    const pageSize = Math.min(100, Math.max(1, rawPageSize ?? 20));

    const wsServer = getWSServer();
    const connectedDids = new Set(
      wsServer?.getConnectedAgents().map((a) => a.id) ?? []
    );

    const online =
      onlineFilter === "true"
        ? true
        : onlineFilter === "false"
          ? false
          : undefined;

    const result = await AgentDAO.query({
      q,
      realm,
      capabilities,
      page,
      pageSize,
      sortBy,
      sortDir,
    });

    const userRealmIds = auth.isGlobalAdmin
      ? null
      : new Set((await RealmDAO.getUserRealms(auth.did)).map((r) => r.realmId));

    const filteredAgents = (
      await Promise.all(
        result.agents.map(async (agent) => {
          if (userRealmIds !== null) {
            const agentRealms = await AgentDAO.getRealms(agent.did);
            if (!agentRealms.some((r) => userRealmIds.has(r.realmId)))
              return null;
          }
          return agent;
        })
      )
    ).filter((a) => a !== null);

    const onlineFiltered =
      online === undefined
        ? filteredAgents
        : filteredAgents.filter((agent) =>
            online
              ? connectedDids.has(agent.did)
              : !connectedDids.has(agent.did)
          );

    const agents = await Promise.all(
      onlineFiltered.map(async (agent) => {
        const connected = wsServer?.getAgent(agent.did);
        const realms = await AgentDAO.getRealms(agent.did);
        return {
          ...agent,
          id: agent.did,
          name: connected?.name ?? agent.name,
          capabilities: agent.capabilities,
          registeredAt: agent.registeredAt,
          lastSeen: agent.lastSeen,
          online: connectedDids.has(agent.did),
          connectedAt: connected?.connectedAt?.toISOString() ?? null,
          lastHeartbeat: connected?.lastHeartbeat?.toISOString() ?? null,
          reportedLlm: connected?.reportedLlm ?? null,
          tokenUsage: connected?.tokenUsage ?? null,
          transport: connected?.transport ?? null,
          locationLat: agent.locationLat ?? null,
          locationLon: agent.locationLon ?? null,
          locationLabel: agent.locationLabel ?? null,
          realms: realms.map((r) => ({
            id: r.realmId,
            name: r.realm.name,
            slug: r.realm.slug,
            color: r.realm.color,
            isPrimary: Boolean(r.isPrimary),
          })),
        };
      })
    );

    return {
      status: 200,
      body: {
        agents,
        total: userRealmIds !== null ? agents.length : result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages:
          userRealmIds !== null
            ? Math.ceil(agents.length / pageSize)
            : result.totalPages,
        online: agents.filter((a) => a.online).length,
      },
    };
  },
});

export const GET = handlers.GET!;
