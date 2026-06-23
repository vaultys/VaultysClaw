import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import { workflowsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Route for GET /api/workflows/:id/export — returns a workflow's portable JSON.
 */
const handlers = createNextRoute(workflowsContract, {
  export: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const workflow = await WorkflowDAO.findById(params.id);
    if (!workflow) throw new APIException("NOT_FOUND", "Workflow not found");

    if (workflow.realmId && !(await auth.canAccessRealm(workflow.realmId)))
      throw new APIException("FORBIDDEN");

    return {
      status: 200,
      body: {
        name: workflow.name,
        description: workflow.description,
        definition: workflow.definition,
        exportedAt: new Date().toISOString(),
        version: "1.0",
      },
    };
  },
});

export const GET = handlers.GET!;
