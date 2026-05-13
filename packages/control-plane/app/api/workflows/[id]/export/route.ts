import { NextRequest, NextResponse } from "next/server";
import { getWorkflow } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const workflow = getWorkflow(id);

  if (!workflow) {
    return NextResponse.json(
      { success: false, error: "Workflow not found" },
      { status: 404 }
    );
  }

  const exportData = {
    name: workflow.name,
    description: workflow.description,
    definition: JSON.parse(workflow.definition),
    exportedAt: new Date().toISOString(),
    version: "1.0",
  };

  return NextResponse.json(exportData, {
    headers: {
      "Content-Disposition": `attachment; filename="workflow-${workflow.name.replace(/\s+/g, "-")}.json"`,
      "Content-Type": "application/json",
    },
  });
}
