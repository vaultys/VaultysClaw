import {
  executeWorkflow,
  type WorkflowDefinition,
} from "@/lib/workflow-executor";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import { workflowsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { inngest, isInngestEngine } from "@/lib/inngest/client";

/**
 * Route for POST /api/workflows/:id/execute — starts a new workflow run.
 */
const handlers = createNextRoute(workflowsContract, {
  execute: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const { id } = params;

    // Verify workflow exists
    const workflow = await WorkflowDAO.findById(id);
    if (!workflow) throw new APIException("NOT_FOUND", "Workflow not found");

    if (workflow.realmId && !(await auth.canAccessRealm(workflow.realmId)))
      throw new APIException("FORBIDDEN");

    const definition = workflow.definition;
    if (!definition)
      throw new APIException("NOT_FOUND", "Workflow has no definition");

    // Start a new run
    const runId = await WorkflowDAO.startRun(id);

    const workflowDef = definition as unknown as WorkflowDefinition;
    // Execution-time input overrides the definition's stored input
    const resolvedInput = body.input ?? workflowDef.input;

    if (isInngestEngine()) {
      // Durable engine (P1): hand the run off to Inngest. The run-workflow function
      // owns the DAG walk, retries, approval waits, and crash recovery.
      await inngest.send({
        name: "workflow/run.requested",
        data: {
          runId,
          workflowId: id,
          input: resolvedInput,
          realmId: workflow.realmId ?? undefined,
        },
      });
    } else {
      // Legacy in-process executor (fire-and-forget).
      Promise.resolve().then(() => {
        executeWorkflow(runId, workflowDef, resolvedInput, id).catch((err) => {
          console.error(`Workflow ${runId} execution failed:`, err);
        });
      });
    }

    return {
      status: 200,
      body: {
        success: true,
        runId,
        workflowId: id,
        status: "running",
      },
    };
  },
});

export const POST = handlers.POST!;
