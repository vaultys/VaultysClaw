import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { WorkflowDAO } from "@/db";

type Params = { runId: string };

/**
 * GET /api/workflows/runs/[runId]/status
 * Get the status of a workflow run. Requires auth and realm membership.
 */
/**
 * @openapi
 * /api/workflows/runs/{runId}/status:
 *   get:
 *     summary: Get the status of a workflow run.
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
 *         description: Successfully retrieved workflow run status.
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
 *                 startedAt:
 *                   type: string
 *                   format: date-time
 *                 completedAt:
 *                   type: string
 *                   format: date-time
 *                 results:
 *                   type: object
 *                   nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch workflow run status.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const auth = await getAuthContext(_request);
    if (!auth) return unauthorized();

    const { runId } = await params;

    const run = await WorkflowDAO.findRun(runId);
    if (!run) {
      return NextResponse.json(
        { error: "Workflow run not found" },
        { status: 404 }
      );
    }

    const workflow = await WorkflowDAO.findById(run.workflowId);
    if (workflow?.realmId && !(await auth.canAccessRealm(workflow.realmId)))
      return forbidden();

    return NextResponse.json({
      success: true,
      runId: run.id,
      workflowId: run.workflowId,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      results: run.results ? run.results : null,
    });
  } catch (err) {
    console.error("GET /api/workflows/runs/[runId]/status error:", err);
    return NextResponse.json(
      { error: "Failed to fetch workflow run status" },
      { status: 500 }
    );
  }
}
