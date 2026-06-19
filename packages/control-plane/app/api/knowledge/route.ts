import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO, KnowledgeDAO, RealmDAO } from "@/db";
import { knowledgeContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(knowledgeContract, {
  // ── GET /api/knowledge?realmId=&agentDid= ─────────────────────────────────
  list: async ({ query, request }) => {
    const auth = await getAuthContext(request);
    const { realmId, agentDid } = query;

    // Non-admins can only list sources for realms they can access.
    if (
      !auth.isGlobalAdmin &&
      realmId &&
      !(await auth.canAccessRealm(realmId))
    ) {
      throw new APIException("FORBIDDEN");
    }

    const sources = await KnowledgeDAO.listSources({ realmId, agentDid });
    return { status: 200, body: { sources } };
  },

  // ── POST /api/knowledge ───────────────────────────────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { realmId, agentDid, name, sourceType, config } = body;

    const realm = await RealmDAO.findById(realmId);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    const agent = await AgentDAO.findByDid(agentDid);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    const source = await KnowledgeDAO.createSource({
      realmId,
      agentDid,
      name,
      sourceType,
      config: config ?? {},
    });

    return { status: 201, body: { source } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
