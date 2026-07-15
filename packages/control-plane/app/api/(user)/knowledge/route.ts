import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { KnowledgeDAO } from "@/db";
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
});

export const GET = handlers.GET!;
