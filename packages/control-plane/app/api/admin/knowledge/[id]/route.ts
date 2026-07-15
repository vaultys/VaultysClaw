import { APIException } from "@/lib/api/utils/api-utils";
import { KnowledgeDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.knowledge, {
  // ── DELETE /api/admin/knowledge/:id ───────────────────────────────────────
  remove: async ({ params }) => {
    const source = await KnowledgeDAO.findSource(params.id);
    if (!source) throw new APIException("NOT_FOUND", "Knowledge source not found");

    await KnowledgeDAO.deleteSource(params.id);
    return { status: 200, body: undefined };
  },
});

export const DELETE = handlers.DELETE!;
