import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { WorkflowDAO } from "@/db";

type Params = { runId: string };

/**
 * GET /api/workflows/runs/[runId]/history
 * Get complete execution history with all steps. Requires auth and realm membership.
 */
/**
 * @openapi
 * /api/workflows/runs/{runId}/history:
 *   get:
 *     summary: Get complete execution history of a workflow run.
 *     tags: [Workflows]
 *     parameters:
 *       - name: runId
 *         in: path
 *         required: true
 *         description: The ID of the workflow run.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response with workflow run history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 run:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     workflowId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     startedAt:
 *                       type: string
 *                       format: date-time
 *                     completedAt:
 *                       type: string
 *                       format: date-time
 *                     results:
 *                       type: object
 *                       nullable: true
 *                 steps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       stepId:
 *                         type: string
 *                       agentId:
 *                         type: string
 *                       assignedUserId:
 *                         type: string
 *                         nullable: true
 *                       assignedUserName:
 *                         type: string
 *                         nullable: true
 *                       assignedUserEmail:
 *                         type: string
 *                         nullable: true
 *                       status:
 *                         type: string
 *                       output:
 *                         type: object
 *                         nullable: true
 *                       error:
 *                         type: string
 *                         nullable: true
 *                       startedAt:
 *                         type: string
 *                         format: date-time
 *                       completedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Internal server error.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const auth = await getAuthContext(_request);
    if (!auth) return unauthorized();

    const { runId } = await params;

    const history = await WorkflowDAO.getRunHistory(runId);
    if (!history) {
      return NextResponse.json(
        { error: "Workflow run not found" },
        { status: 404 }
      );
    }

    const workflow = await WorkflowDAO.findById(history.run.workflowId);
    if (workflow?.realmId && !(await auth.canAccessRealm(workflow.realmId)))
      return forbidden();

    return NextResponse.json({
      success: true,
      run: {
        id: history.run.id,
        workflowId: history.run.workflowId,
        status: history.run.status,
        startedAt: history.run.startedAt,
        completedAt: history.run.completedAt,
        results: history.run.results ? history.run.results : null,
      },
      steps: history.steps.map((step) => ({
        id: step.id,
        stepId: step.stepId,
        agentId: step.agentId,
        assignedUserId: step.assignedUserId ?? null,
        assignedUserName: step.assignedUserName ?? null,
        assignedUserEmail: step.assignedUserEmail ?? null,
        status: step.status,
        output: step.output ? step.output : null,
        error: step.error,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
      })),
    });
  } catch (err) {
    console.error("GET /api/workflows/runs/[runId]/history error:", err);
    return NextResponse.json(
      { error: "Failed to fetch workflow run history" },
      { status: 500 }
    );
  }
}
