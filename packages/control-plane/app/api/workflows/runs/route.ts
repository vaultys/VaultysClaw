import { getAuthContext } from "@/lib/auth-utils";
import { WorkflowDAO } from "@/db";
import { workflowRunsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Route for GET /api/workflows/runs — paginated list of workflow runs.
 */
const handlers = createNextRoute(workflowRunsContract, {
  list: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const realmIds = auth.isGlobalAdmin ? undefined : auth.realmIds;

    const result = await WorkflowDAO.queryRuns({
      workflowId: query.workflowId,
      status: query.status,
      page,
      pageSize,
      sortBy: query.sortBy ?? "startedAt",
      sortDir: query.sortDir ?? "desc",
      realmIds,
    });

    return {
      status: 200,
      body: {
        runs: result.runs,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
    };
  },
});

export const GET = handlers.GET!;
