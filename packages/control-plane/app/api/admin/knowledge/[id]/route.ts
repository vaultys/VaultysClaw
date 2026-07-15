import { APIException } from "@/lib/api/utils/api-utils";
import { getAuthContext } from "@/lib/auth-utils";
import { KnowledgeDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { enqueueNotification } from "@/lib/notification-queue";

const handlers = createNextRoute(adminContract.knowledge, {
  // ── DELETE /api/admin/knowledge/:id ───────────────────────────────────────
  remove: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    const source = await KnowledgeDAO.findSource(params.id);
    if (!source) throw new APIException("NOT_FOUND", "Knowledge source not found");

    await KnowledgeDAO.deleteSource(params.id);

    void enqueueNotification({
      eventType: "knowledge.removed",
      data: {
        knowledgeId: params.id,
        knowledgeName: source.name,
        workspaceId: source.workspaceId,
        actorDid: auth.did,
      },
    });

    return { status: 200, body: undefined };
  },
});

export const DELETE = handlers.DELETE!;
