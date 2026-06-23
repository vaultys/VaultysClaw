import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import { workflowsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Route for GET /api/workflows/runs/:runId/status — current run status.
 */
const handlers = createNextRoute(workflowsContract, {
  runStatus: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const run = await WorkflowDAO.findRun(params.runId);
    if (!run) throw new APIException("NOT_FOUND", "Workflow run not found");

    const workflow = await WorkflowDAO.findById(run.workflowId);
    if (workflow?.realmId && !(await auth.canAccessRealm(workflow.realmId)))
      throw new APIException("FORBIDDEN");

    return {
      status: 200,
      body: {
        success: true,
        runId: run.id,
        workflowId: run.workflowId,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        results: run.results ?? null,
      },
    };
  },
});

export const GET = handlers.GET!;
