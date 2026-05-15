import { NextRequest, NextResponse } from "next/server";
import { getWorkflow } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const { id } = await params;
  const workflow = getWorkflow(id);

  if (!workflow) {
    return NextResponse.json(
      { success: false, error: "Workflow not found" },
      { status: 404 }
    );
  }

  if (workflow.realm_id && !auth.canAccessRealm(workflow.realm_id)) return forbidden();

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
