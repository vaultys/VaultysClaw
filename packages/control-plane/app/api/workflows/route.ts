import { NextRequest, NextResponse } from "next/server";
import {
  saveWorkflow,
  listWorkflows,
  deleteWorkflow,
  type WorkflowDefinition,
} from "@/lib/db";

/**
 * POST /api/workflows
 * Save a new workflow
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, definition, realmId } = body as {
      name?: string;
      description?: string;
      definition?: WorkflowDefinition;
      realmId?: string;
    };

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name (string) is required" }, { status: 400 });
    }
    if (!definition || typeof definition !== "object") {
      return NextResponse.json({ error: "definition (object) is required" }, { status: 400 });
    }

    const id = saveWorkflow(name, definition, undefined, realmId);

    return NextResponse.json({ success: true, id, name, description, realmId: realmId || "default" });
  } catch (err) {
    console.error("POST /api/workflows error:", err);
    return NextResponse.json({ error: "Failed to save workflow" }, { status: 500 });
  }
}

/**
 * GET /api/workflows
 * List all workflows, optionally filtered by creator or realm
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const createdBy = searchParams.get("createdBy");
    const realmId = searchParams.get("realmId");

    const workflows = listWorkflows(createdBy ?? undefined, realmId ?? undefined);

    return NextResponse.json({
      success: true,
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        realmId: w.realm_id,
        createdBy: w.created_by,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    });
  } catch (err) {
    console.error("GET /api/workflows error:", err);
    return NextResponse.json({ error: "Failed to list workflows" }, { status: 500 });
  }
}
