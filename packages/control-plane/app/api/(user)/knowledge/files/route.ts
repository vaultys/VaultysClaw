import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { KnowledgeDAO } from "@/db";
import { userContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(userContract.knowledge, {
  // ── GET /api/knowledge/files?sourceId= — list file metadata (no content) ──
  listFiles: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const source = await KnowledgeDAO.findSource(query.sourceId);
    if (!source) throw new APIException("NOT_FOUND", "Source not found");

    if (!auth.isGlobalAdmin && !(await auth.canAccessWorkspace(source.workspaceId)))
      throw new APIException("FORBIDDEN");

    const files = await KnowledgeDAO.listFiles(query.sourceId);
    return { status: 200, body: { files } };
  },
});

export const GET = handlers.GET!;
