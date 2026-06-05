import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { RealmDAO, WorkflowDAO } from "@/db";
import type { WorkflowDefinition } from "@/lib/workflow-executor";
import { Prisma } from "@prisma/client";

/**
 * POST /api/workflows
 * Save a new workflow. Requires realm admin or global admin for the target realm.
 */
/**
 * @openapi
 * /api/workflows:
 *   post:
 *     summary: Save a new workflow.
 *     tags: [Workflows]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the workflow.
 *               description:
 *                 type: string
 *                 description: A brief description of the workflow.
 *               definition:
 *                 $ref: '#/components/schemas/WorkflowDefinition'
 *               realmId:
 *                 type: string
 *                 description: The ID of the realm.
 *             required:
 *               - name
 *               - definition
 *     responses:
 *       200:
 *         description: Workflow saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 realmId:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to save workflow.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();

    const body = await request.json();
    const { name, description, definition, realmId } = body as {
      name?: string;
      description?: string;
      definition?: WorkflowDefinition;
      realmId?: string;
    };

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "name (string) is required" },
        { status: 400 }
      );
    }
    if (!definition || typeof definition !== "object") {
      return NextResponse.json(
        { error: "definition (object) is required" },
        { status: 400 }
      );
    }

    // If no realmId, must be global admin (no implicit realm to check admin on)
    if (realmId) {
      if (!(await auth.canAdminRealm(realmId))) return forbidden();
    } else if (!auth.isGlobalAdmin) {
      return forbidden();
    }

    const id = await WorkflowDAO.create(
      name,
      definition as unknown as Prisma.InputJsonValue,
      undefined,
      realmId
    );

    return NextResponse.json({
      success: true,
      id,
      name,
      description,
      realmId: realmId || "default",
    });
  } catch (err) {
    console.error("POST /api/workflows error:", err);
    return NextResponse.json(
      { error: "Failed to save workflow" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workflows
 * List workflows. Admins see all; members see only workflows in their realms.
 */
/**
 * @openapi
 * /api/workflows:
 *   get:
 *     summary: List workflows visible to the user.
 *     tags: [Workflows]
 *     responses:
 *       200:
 *         description: A list of workflows.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 workflows:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       realmId:
 *                         type: string
 *                       createdBy:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to list workflows.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();

    const { searchParams } = request.nextUrl;
    const createdBy = searchParams.get("createdBy");
    const realmId = searchParams.get("realmId");

    // Members can only query realms they belong to
    if (realmId && !(await auth.canAccessRealm(realmId))) return forbidden();

    let workflows = await WorkflowDAO.list({
      createdBy: createdBy ?? undefined,
      realmId: realmId ?? undefined,
    });

    // Non-admins: filter to workflows in their realms
    if (!auth.isGlobalAdmin) {
      const userRealmIds = new Set(
        (await RealmDAO.getUserRealms(auth.did)).map((r) => r.realmId)
      );
      workflows = workflows.filter(
        (w) => w.realmId && userRealmIds.has(w.realmId)
      );
    }

    return NextResponse.json({
      success: true,
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        realmId: w.realmId,
        createdBy: w.createdBy,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      })),
    });
  } catch (err) {
    console.error("GET /api/workflows error:", err);
    return NextResponse.json(
      { error: "Failed to list workflows" },
      { status: 500 }
    );
  }
}
