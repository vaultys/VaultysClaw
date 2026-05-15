import { NextRequest, NextResponse } from "next/server";
import { getWorkflowRun, getWorkflow } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

type Params = { runId: string };

/**
 * GET /api/workflows/runs/[runId]/status
 * Get the status of a workflow run. Requires auth and realm membership.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { runId } = await params;

    const run = getWorkflowRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });
    }

    const workflow = getWorkflow(run.workflow_id);
    if (workflow?.realm_id && !auth.canAccessRealm(workflow.realm_id)) return forbidden();

    return NextResponse.json({
      success: true,
      runId: run.id,
      workflowId: run.workflow_id,
      status: run.status,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      results: run.results ? JSON.parse(run.results) : null,
    });
  } catch (err) {
    console.error("GET /api/workflows/runs/[runId]/status error:", err);
    return NextResponse.json({ error: "Failed to fetch workflow run status" }, { status: 500 });
  }
}
