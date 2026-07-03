import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { KnowledgeDAO } from "@/db";
import {
  userContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(userContract.knowledge, {
  // ── GET /api/knowledge/:id ────────────────────────────────────────────────
  getOne: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const source = await KnowledgeDAO.findSource(params.id);
    if (!source) throw new APIException("NOT_FOUND", "Knowledge source not found");

    if (!auth.isGlobalAdmin && !(await auth.canAccessWorkspace(source.workspaceId))) {
      throw new APIException("FORBIDDEN");
    }

    return { status: 200, body: { source } };
  },

  // ── DELETE /api/knowledge/:id ─────────────────────────────────────────────
  remove: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const source = await KnowledgeDAO.findSource(params.id);
    if (!source) throw new APIException("NOT_FOUND", "Knowledge source not found");

    await KnowledgeDAO.deleteSource(params.id);
    return { status: 200, body: undefined };
  },
});

export const GET = handlers.GET!;
export const DELETE = handlers.DELETE!;
