import { NextRequest, NextResponse } from "next/server";
import {
  saveWorkflow,
  listWorkflows,
  getUserRealms,
  type WorkflowDefinition,
} from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

/**
 * POST /api/workflows
 * Save a new workflow. Requires realm admin or global admin for the target realm.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

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

    // If no realmId, must be global admin (no implicit realm to check admin on)
    if (realmId) {
      if (!auth.canAdminRealm(realmId)) return forbidden();
    } else if (!auth.isGlobalAdmin) {
      return forbidden();
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
 * List workflows. Admins see all; members see only workflows in their realms.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { searchParams } = request.nextUrl;
    const createdBy = searchParams.get("createdBy");
    const realmId = searchParams.get("realmId");

    // Members can only query realms they belong to
    if (realmId && !auth.canAccessRealm(realmId)) return forbidden();

    let workflows = listWorkflows(createdBy ?? undefined, realmId ?? undefined);

    // Non-admins: filter to workflows in their realms
    if (!auth.isGlobalAdmin) {
      const userRealmIds = new Set(getUserRealms(auth.did).map((r) => r.realm_id));
      workflows = workflows.filter((w) => w.realm_id && userRealmIds.has(w.realm_id));
    }

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
