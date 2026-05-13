import { NextRequest, NextResponse } from "next/server";
import { saveWorkflow } from "@/lib/db";
import type { WorkflowDefinition } from "@/lib/db";

interface ImportPayload {
  name: string;
  description?: string;
  definition: WorkflowDefinition;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImportPayload;

    // Validate required fields
    if (!body.name || !body.definition) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: name, definition" },
        { status: 400 }
      );
    }

    // Validate definition structure
    if (!Array.isArray(body.definition.nodes) || !Array.isArray(body.definition.edges)) {
      return NextResponse.json(
        { success: false, error: "Invalid workflow definition structure" },
        { status: 400 }
      );
    }

    const id = saveWorkflow(body.name, body.definition, undefined);

    return NextResponse.json({
      success: true,
      id,
      message: `Workflow "${body.name}" imported successfully`,
    });
  } catch (error) {
    console.error("Import failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to import workflow" },
      { status: 500 }
    );
  }
}
