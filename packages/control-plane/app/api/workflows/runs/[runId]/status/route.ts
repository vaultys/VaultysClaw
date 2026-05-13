import { NextRequest, NextResponse } from "next/server";
import { getWorkflowRun } from "@/lib/db";

type Params = { runId: string };

/**
 * GET /api/workflows/runs/[runId]/status
 * Get the status of a workflow run
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { runId } = await params;

    const run = getWorkflowRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });
    }

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
