import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import { workflowsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Route for GET /api/workflows/runs/:runId/history — full run execution history.
 */
const handlers = createNextRoute(workflowsContract, {
  runHistory: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const history = await WorkflowDAO.getRunHistory(params.runId);
    if (!history) throw new APIException("NOT_FOUND", "Workflow run not found");

    const workflow = await WorkflowDAO.findById(history.run.workflowId);
    if (workflow?.workspaceId && !(await auth.canAccessWorkspace(workflow.workspaceId)))
      throw new APIException("FORBIDDEN");

    return {
      status: 200,
      body: {
        success: true,
        run: {
          id: history.run.id,
          workflowId: history.run.workflowId,
          status: history.run.status,
          startedAt: history.run.startedAt,
          completedAt: history.run.completedAt,
          results: history.run.results ?? null,
        },
        steps: history.steps.map((step) => ({
          id: step.id,
          stepId: step.stepId,
          agentId: step.agentId,
          assignedUserId: step.assignedUserId ?? null,
          assignedUserName: step.assignedUserName ?? null,
          assignedUserEmail: step.assignedUserEmail ?? null,
          status: step.status,
          output: step.output ?? null,
          error: step.error,
          startedAt: step.startedAt,
          completedAt: step.completedAt,
        })),
      },
    };
  },
});

export const GET = handlers.GET!;
