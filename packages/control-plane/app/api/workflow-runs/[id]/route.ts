import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getWorkflowRunHistory } from "@/lib/db";

/**
 * GET /api/workflow-runs/[id]
 * Get a specific workflow run with its history and steps
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.did) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = getWorkflowRunHistory(id);

    if (!result) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json({
      run: result.run,
      workflow: result.workflow
        ? {
          id: result.workflow.id,
          name: result.workflow.name,
          definition: JSON.parse(result.workflow.definition),
        }
        : null,
      steps: result.steps,
    });
  } catch (error) {
    console.error("Failed to fetch workflow run:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflow run" },
      { status: 500 }
    );
  }
}
