import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import { workflowRunsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Route for GET /api/workflows/runs/:runId — a run with its workflow + steps.
 */
const handlers = createNextRoute(workflowRunsContract, {
  getOne: async ({ params, request }) => {
    await getAuthContext(request);

    const result = await WorkflowDAO.getRunHistory(params.runId);
    if (!result) throw new APIException("NOT_FOUND", "Run not found");

    return {
      status: 200,
      body: {
        run: result.run,
        workflow: result.workflow
          ? {
              id: result.workflow.id,
              name: result.workflow.name,
              definition: result.workflow.definition,
            }
          : null,
        steps: result.steps,
      },
    };
  },
});

export const GET = handlers.GET!;
