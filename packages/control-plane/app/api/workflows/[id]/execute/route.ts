import { NextRequest, NextResponse } from "next/server";
import { executeWorkflow, type WorkflowDefinition } from "@/lib/workflow-executor";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { WorkflowDAO } from "@/db";

type Params = { id: string };

/**
 * POST /api/workflows/[id]/execute
 * Start a new workflow run. Requires realm membership for the workflow's realm.
 * Body: { input?: string } — optional input for the first node
 */
/**
 * @openapi
 * /api/workflows/{id}/execute:
 *   post:
 *     summary: Start a new workflow run.
 *     tags: [Workflows]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow to execute.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               input:
 *                 type: string
 *                 description: Optional input for the first node.
 *     responses:
 *       200:
 *         description: Workflow execution started successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 runId:
 *                   type: string
 *                 workflowId:
 *                   type: string
 *                 status:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to start workflow execution.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();

    const { id } = await params;

    // Parse optional input
    let input: string | undefined;
    try {
      const body = await request.json();
      input = body?.input;
    } catch {
      // No body is fine
    }

    // Verify workflow exists
    const workflow = await WorkflowDAO.findById(id);
    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    if (workflow.realmId && !(await auth.canAccessRealm(workflow.realmId)))
      return forbidden();

    // Start a new run
    const runId = await WorkflowDAO.startRun(id);

    // Trigger execution asynchronously (don't await, return immediately)
    const definition = workflow.definition;
    if (!definition) {
      return NextResponse.json(
        { error: "Workflow has no definition" },
        { status: 400 }
      );
    }
    const workflowDef = definition as unknown as WorkflowDefinition;
    // Execution-time input overrides the definition's stored input
    const resolvedInput = input ?? workflowDef.input;
    Promise.resolve().then(() => {
      executeWorkflow(runId, workflowDef, resolvedInput, id).catch((err) => {
        console.error(`Workflow ${runId} execution failed:`, err);
      });
    });

    return NextResponse.json({
      success: true,
      runId,
      workflowId: id,
      status: "running",
    });
  } catch (err) {
    console.error("POST /api/workflows/[id]/execute error:", err);
    return NextResponse.json(
      { error: "Failed to start workflow execution" },
      { status: 500 }
    );
  }
}
