import { APIException } from "@/lib/api/utils/api-utils";
import { KnowledgeDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.knowledge, {
  // ── DELETE /api/admin/knowledge/files/:fileId ─────────────────────────────
  deleteFile: async ({ params }) => {
    const file = await KnowledgeDAO.findFile(params.fileId);
    if (!file) throw new APIException("NOT_FOUND", "File not found");

    await KnowledgeDAO.deleteFile(params.fileId);
    return { status: 200, body: undefined };
  },
});

export const DELETE = handlers.DELETE!;
