import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO, KnowledgeDAO, WorkspaceDAO } from "@/db";
import { userContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(userContract.knowledge, {
  // ── GET /api/knowledge?workspaceId=&agentDid= ─────────────────────────────────
  list: async ({ query, request }) => {
    const auth = await getAuthContext(request);
    const { workspaceId, agentDid } = query;

    // Non-admins can only list sources for workspaces they can access.
    if (
      !auth.isGlobalAdmin &&
      workspaceId &&
      !(await auth.canAccessWorkspace(workspaceId))
    ) {
      throw new APIException("FORBIDDEN");
    }

    const sources = await KnowledgeDAO.listSources({ workspaceId, agentDid });
    return { status: 200, body: { sources } };
  },

  // ── POST /api/knowledge ───────────────────────────────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { workspaceId, agentDid, name, sourceType, config } = body;

    const workspace = await WorkspaceDAO.findById(workspaceId);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    const agent = await AgentDAO.findByDid(agentDid);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    const source = await KnowledgeDAO.createSource({
      workspaceId,
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
