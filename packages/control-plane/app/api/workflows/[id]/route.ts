import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { WorkflowDAO } from "@/db";
import type { WorkflowDefinition } from "@/lib/workflow-executor";
import { Prisma } from "@prisma/client";

type Params = { id: string };

/**
 * GET /api/workflows/[id]
 * Fetch a single workflow. Requires auth and realm membership.
 */
/**
 * @openapi
 * /api/workflows/{id}:
 *   get:
 *     summary: Fetch a single workflow by ID.
 *     tags: [Workflows]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the workflow to fetch.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully fetched the workflow.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 workflow:
 *                   $ref: '#/components/schemas/Workflow'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch workflow.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const auth = await getAuthContext(_request);
    if (!auth) return unauthorized();

    const { id } = await params;
    const workflow = await WorkflowDAO.findById(id);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    if (workflow.realmId && !(await auth.canAccessRealm(workflow.realmId)))
      return forbidden();

    return NextResponse.json({
      success: true,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        definition: workflow.definition,
        realmId: workflow.realmId,
        createdBy: workflow.createdBy,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      },
    });
  } catch (err) {
    console.error("GET /api/workflows/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch workflow" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workflows/[id]
 * Update a workflow. Requires realm admin or global admin.
 */
/**
 * @openapi
 * /api/workflows/{id}:
 *   patch:
 *     summary: Update a workflow.
 *     tags: [Workflows]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the workflow to update.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               definition:
 *                 $ref: '#/components/schemas/WorkflowDefinition'
 *               description:
 *                 type: string
 *               realmId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Workflow updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 id:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to update workflow.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();

    const { id } = await params;
    const workflow = await WorkflowDAO.findById(id);
    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    if (workflow.realmId && !(await auth.canAdminRealm(workflow.realmId)))
      return forbidden();
    if (!workflow.realmId && !auth.isGlobalAdmin) return forbidden();

    const body = await request.json();
    const { name, definition, description, realmId } = body as {
      name?: string;
      definition?: WorkflowDefinition;
      description?: string;
      realmId?: string;
    };

    if (!name && !definition && !description && !realmId) {
      return NextResponse.json(
        {
          error:
            "At least one of name, definition, description, or realmId is required",
        },
        { status: 400 }
      );
    }

    await WorkflowDAO.update(id, {
      name,
      definition: definition as unknown as Prisma.InputJsonValue,
      description,
      realmId,
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("PATCH /api/workflows/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update workflow" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workflows/[id]
 * Delete a workflow. Requires realm admin or global admin.
 */
/**
 * @openapi
 * /api/workflows/{id}:
 *   delete:
 *     summary: Delete a workflow
 *     tags: [Workflows]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the workflow to delete
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Workflow successfully deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 id:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to delete workflow
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const auth = await getAuthContext(_request);
    if (!auth) return unauthorized();

    const { id } = await params;
    const workflow = await WorkflowDAO.findById(id);
    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    if (workflow.realmId && !(await auth.canAdminRealm(workflow.realmId)))
      return forbidden();
    if (!workflow.realmId && !auth.isGlobalAdmin) return forbidden();

    await WorkflowDAO.delete(id);

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("DELETE /api/workflows/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete workflow" },
      { status: 500 }
    );
  }
}
