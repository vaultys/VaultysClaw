import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { WorkflowDAO } from "@/db";
import type { WorkflowDefinition } from "@/lib/workflow-executor";
import { Prisma } from "@prisma/client";

interface ImportPayload {
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  realmId?: string;
}

/**
 * @openapi
 * /api/workflows/import:
 *   post:
 *     summary: Import a new workflow definition.
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
 *                 description: An optional description of the workflow.
 *               definition:
 *                 $ref: '#/components/schemas/WorkflowDefinition'
 *               realmId:
 *                 type: string
 *                 description: The ID of the realm, if applicable.
 *             required:
 *               - name
 *               - definition
 *     responses:
 *       200:
 *         description: Workflow imported successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 id:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to import workflow.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();

    const body = (await request.json()) as ImportPayload;

    if (body.realmId && !(await auth.canAdminRealm(body.realmId)))
      return forbidden();
    if (!body.realmId && !auth.isGlobalAdmin) return forbidden();

    // Validate required fields
    if (!body.name || !body.definition) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: name, definition" },
        { status: 400 }
      );
    }

    // Validate definition structure
    if (
      !Array.isArray(body.definition.nodes) ||
      !Array.isArray(body.definition.edges)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid workflow definition structure" },
        { status: 400 }
      );
    }

    const id = await WorkflowDAO.create(
      body.name,
      body.definition as unknown as Prisma.InputJsonValue
    );

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
