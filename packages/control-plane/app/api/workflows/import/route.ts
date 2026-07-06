import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";

import { Prisma } from "@prisma/client";
import { workflowsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { WorkflowDefinition } from "@/lib/workflow-types";

/**
 * Route for POST /api/workflows/import — create a workflow from a definition.
 */
const handlers = createNextRoute(workflowsContract, {
  import: async ({ body, request }) => {
    const auth = await getAuthContext(request);

    if (body.workspaceId && !(await auth.canAdminWorkspace(body.workspaceId)))
      throw new APIException("FORBIDDEN");
    if (!body.workspaceId && !auth.isGlobalAdmin)
      throw new APIException("FORBIDDEN");

    // Validate definition structure
    const definition = body.definition as unknown as WorkflowDefinition;
    if (!Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
      throw new APIException(
        "MALFORMED",
        "Invalid workflow definition structure"
      );
    }

    const workflow = await WorkflowDAO.create(
      body.name,
      body.definition as unknown as Prisma.InputJsonValue
    );

    return {
      status: 200,
      body: {
        workflow,
      },
    };
  },
});

export const POST = handlers.POST!;
