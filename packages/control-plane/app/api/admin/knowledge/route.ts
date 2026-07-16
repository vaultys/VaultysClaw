import { APIException } from "@/lib/api/utils/api-utils";
import { getAuthContext } from "@/lib/auth-utils";
import { AgentDAO, KnowledgeDAO, WorkspaceDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { enqueueNotification } from "@/lib/notification-queue";
import { enqueueWebhook } from "@/lib/webhook-queue";
import { knowledgePayload } from "@/lib/webhook-payloads";

const handlers = createNextRoute(adminContract.knowledge, {
  // ── POST /api/admin/knowledge ─────────────────────────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);
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

    void enqueueNotification({
      eventType: "knowledge.added",
      data: {
        knowledgeId: source.id,
        knowledgeName: name,
        workspaceId,
        workspaceName: workspace.name,
        actorDid: auth.did,
      },
    });
    void enqueueWebhook({
      eventType: "knowledge.created",
      payload: knowledgePayload(source),
    });

    return { status: 201, body: { source } };
  },
});

export const POST = handlers.POST!;
