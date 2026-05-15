import { NextRequest, NextResponse } from "next/server";
import { getWorkflow, updateWorkflow, deleteWorkflow, type WorkflowDefinition } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

type Params = { id: string };

/**
 * GET /api/workflows/[id]
 * Fetch a single workflow. Requires auth and realm membership.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await params;
    const workflow = getWorkflow(id);

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    if (workflow.realm_id && !auth.canAccessRealm(workflow.realm_id)) return forbidden();

    return NextResponse.json({
      success: true,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        definition: JSON.parse(workflow.definition),
        realmId: workflow.realm_id,
        createdBy: workflow.created_by,
        createdAt: workflow.created_at,
        updatedAt: workflow.updated_at,
      },
    });
  } catch (err) {
    console.error("GET /api/workflows/[id] error:", err);
    return NextResponse.json({ error: "Failed to fetch workflow" }, { status: 500 });
  }
}

/**
 * PATCH /api/workflows/[id]
 * Update a workflow. Requires realm admin or global admin.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await params;
    const workflow = getWorkflow(id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    if (workflow.realm_id && !auth.canAdminRealm(workflow.realm_id)) return forbidden();
    if (!workflow.realm_id && !auth.isGlobalAdmin) return forbidden();

    const body = await request.json();
    const { name, definition, description, realmId } = body as {
      name?: string;
      definition?: WorkflowDefinition;
      description?: string;
      realmId?: string;
    };

    if (!name && !definition && !description && !realmId) {
      return NextResponse.json(
        { error: "At least one of name, definition, description, or realmId is required" },
        { status: 400 },
      );
    }

    updateWorkflow(id, name, definition, description, realmId);

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("PATCH /api/workflows/[id] error:", err);
    return NextResponse.json({ error: "Failed to update workflow" }, { status: 500 });
  }
}

/**
 * DELETE /api/workflows/[id]
 * Delete a workflow. Requires realm admin or global admin.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await params;
    const workflow = getWorkflow(id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    if (workflow.realm_id && !auth.canAdminRealm(workflow.realm_id)) return forbidden();
    if (!workflow.realm_id && !auth.isGlobalAdmin) return forbidden();

    deleteWorkflow(id);

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("DELETE /api/workflows/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete workflow" }, { status: 500 });
  }
}
