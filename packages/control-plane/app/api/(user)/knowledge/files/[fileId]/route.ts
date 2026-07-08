import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { KnowledgeDAO } from "@/db";
import { userContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(userContract.knowledge, {
  // ── DELETE /api/knowledge/files/:fileId ───────────────────────────────────
  deleteFile: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const file = await KnowledgeDAO.findFile(params.fileId);
    if (!file) throw new APIException("NOT_FOUND", "File not found");

    // Verify access against the parent source's workspace.
    const source = await KnowledgeDAO.findSource(file.sourceId);
    if (
      source &&
      !auth.isGlobalAdmin &&
      !(await auth.canAccessWorkspace(source.workspaceId))
    ) {
      throw new APIException("FORBIDDEN");
    }

    await KnowledgeDAO.deleteFile(params.fileId);
    return { status: 200, body: undefined };
  },
});

export const DELETE = handlers.DELETE!;
