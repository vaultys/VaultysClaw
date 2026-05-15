import { NextRequest, NextResponse } from "next/server";
import { getWorkflow, startWorkflowRun } from "@/lib/db";
import { executeWorkflow } from "@/lib/workflow-executor";

type Params = { id: string };

/**
 * POST /api/workflows/[id]/execute
 * Start a new workflow run
 * Body: { input?: string } — optional input for the first node
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
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
    const workflow = getWorkflow(id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // Start a new run
    const runId = startWorkflowRun(id);

    // Trigger execution asynchronously (don't await, return immediately)
    const definition = JSON.parse(workflow.definition);
    // Execution-time input overrides the definition's stored input
    const resolvedInput = input ?? definition.input;
    Promise.resolve().then(() => {
      executeWorkflow(runId, definition, resolvedInput, id).catch((err) => {
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
    return NextResponse.json({ error: "Failed to start workflow execution" }, { status: 500 });
  }
}
