import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { AgentDAO, RealmDAO } from "@/db";
import { agentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { APIException } from "@/lib/api/utils/api-utils";

const handlers = createNextRoute(agentsContract, {
  search: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const {
      search,
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

    const userRealmIds = auth.isGlobalAdmin ? undefined : auth.realmIds;

    // Single DB call — realm & online filters applied inside the DAO
    const result = await AgentDAO.query({
      search,
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

  // ─── POST /api/agents — provision an agent identity ──────────────────────────
  createAgent: async ({ body, request }) => {
    const auth = await getAuthContext(request);

    const { did, name, publicKey, realmSlug, capabilities } = body;

    // Resolve the target realm (if any) up-front so we can authorize against it.
    let realm = realmSlug ? await RealmDAO.findBySlug(realmSlug) : null;
    if (realmSlug && !realm) {
      throw new APIException("NOT_FOUND", `Realm "${realmSlug}" not found`);
    }

    // Global admins may provision anywhere; otherwise the caller must be an
    // admin of the target realm.
    if (!auth.isGlobalAdmin) {
      if (!realm || !(await auth.canAdminRealm(realm.id))) {
        throw new APIException("FORBIDDEN");
      }
    }

    await AgentDAO.upsert({
      did,
      name,
      publicKey: publicKey ?? undefined,
      capabilities: capabilities ?? [],
    });

    if (realm) {
      await AgentDAO.addToRealm(did, realm.id, true);
    }

    const created = await AgentDAO.findByDid(did);
    if (!created) throw new APIException("INTERNAL_ERROR");

    const wsServer = getWSServer();
    const connected = wsServer?.getAgent(did);
    return {
      status: 201,
      body: {
        ...created,
        online: Boolean(connected),
        connectedAt: connected?.connectedAt ?? null,
        lastHeartbeat: connected?.lastHeartbeat ?? null,
        reportedLlm:
          (connected?.reportedLlm as
            | { provider: string; model: string }
            | null
            | undefined) ?? null,
        transport: (connected?.transport ?? null) as "ws" | "peerjs" | null,
      },
    };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
