import { NextRequest, NextResponse } from "next/server";
import { getWorkflowRunHistory } from "@/lib/db";

type Params = { runId: string };

/**
 * GET /api/workflows/runs/[runId]/history
 * Get complete execution history with all steps
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { runId } = await params;

    const history = getWorkflowRunHistory(runId);
    if (!history) {
      return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      run: {
        id: history.run.id,
        workflowId: history.run.workflow_id,
        status: history.run.status,
        startedAt: history.run.started_at,
        completedAt: history.run.completed_at,
        results: history.run.results ? JSON.parse(history.run.results) : null,
      },
      steps: history.steps.map((step) => ({
        id: step.id,
        stepId: step.step_id,
        agentId: step.agent_id,
        assignedUserId: step.assigned_user_id ?? null,
        assignedUserName: step.assigned_user_name ?? null,
        assignedUserEmail: step.assigned_user_email ?? null,
        status: step.status,
        output: step.output ? JSON.parse(step.output) : null,
        error: step.error,
        startedAt: step.started_at,
        completedAt: step.completed_at,
      })),
    });
  } catch (err) {
    console.error("GET /api/workflows/runs/[runId]/history error:", err);
    return NextResponse.json({ error: "Failed to fetch workflow run history" }, { status: 500 });
  }
}
