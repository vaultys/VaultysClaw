import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { AgentDAO, RealmDAO } from "@/db";
import { agentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(agentsContract, {
  search: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const q = query.q?.toLowerCase() ?? "";
    const realmId = query.realm;

    type AgentEntry = { did: string; name: string; capabilities?: string | null };
    let agentList: AgentEntry[];

    if (auth.isGlobalAdmin) {
      // Admins/owners see everything
      if (realmId && realmId !== "default") {
        agentList = (await RealmDAO.getAgents(realmId)).map((ra) => ({
          did: ra.agent.did,
          name: ra.agent.name,
          capabilities:
            ra.agent.capabilities === null
              ? null
              : JSON.stringify(ra.agent.capabilities),
        }));
      } else {
        agentList = (await AgentDAO.findAll()).map((a) => ({
          did: a.did,
          name: a.name,
          capabilities:
            a.capabilities === null ? null : JSON.stringify(a.capabilities),
        }));
      }
    } else {
      // Regular users: only agents in their accessible realms
      const userRealms = await RealmDAO.getUserRealms(auth.did);
      const userRealmIds = new Set(userRealms.map((r) => r.realmId));

      if (userRealmIds.size === 0) {
        agentList = [];
      } else if (realmId && realmId !== "default") {
        // Only return agents from that realm if the user can access it
        if (!userRealmIds.has(realmId)) {
          agentList = [];
        } else {
          agentList = (await RealmDAO.getAgents(realmId)).map((ra) => ({
            did: ra.agent.did,
            name: ra.agent.name,
            capabilities:
              ra.agent.capabilities === null
                ? null
                : JSON.stringify(ra.agent.capabilities),
          }));
        }
      } else {
        // Collect agents across all of the user's realms (deduplicated)
        const perRealm = await Promise.all(
          Array.from(userRealmIds).map((rid) => RealmDAO.getAgents(rid))
        );
        const seen = new Set<string>();
        agentList = perRealm
          .flat()
          .filter((ra) => {
            if (seen.has(ra.agent.did)) return false;
            seen.add(ra.agent.did);
            return true;
          })
          .map((ra) => ({
            did: ra.agent.did,
            name: ra.agent.name,
            capabilities:
              ra.agent.capabilities === null
                ? null
                : JSON.stringify(ra.agent.capabilities),
          }));
      }
    }

    const wsServer = getWSServer();
    const connectedDids = new Set(
      wsServer?.getConnectedAgents().map((ca) => ca.id) ?? []
    );

    const matches = agentList.filter((a) => {
      if (!q) return true;
      return (
        (a.name ?? "").toLowerCase().includes(q) ||
        (a.did ?? "").toLowerCase().includes(q)
      );
    });

    return {
      status: 200,
      body: {
        agents: matches.slice(0, 20).map((a) => ({
          id: a.did,
          did: a.did,
          name: a.name,
          capabilities: (() => {
            try {
              return JSON.parse(a.capabilities ?? "[]");
            } catch {
              return [];
            }
          })(),
          online: connectedDids.has(a.did),
        })),
      },
    };
  },
});

export const GET = handlers.GET!;
