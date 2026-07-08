import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO, KnowledgeDAO, WorkspaceDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.knowledge, {
  // ── POST /api/admin/knowledge ─────────────────────────────────────────────
  create: async ({ body }) => {
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

export const POST = handlers.POST!;
