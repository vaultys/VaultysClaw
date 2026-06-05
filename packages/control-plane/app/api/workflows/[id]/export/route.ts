import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { WorkflowDAO } from "@/db";

/**
 * @openapi
 * /api/workflows/{id}/export:
 *   get:
 *     summary: Export a workflow by ID.
 *     tags: [Workflows]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the workflow to export.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Workflow export data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 definition:
 *                   type: object
 *                 exportedAt:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { id } = await params;
  const workflow = await WorkflowDAO.findById(id);

  if (!workflow) {
    return NextResponse.json(
      { success: false, error: "Workflow not found" },
      { status: 404 }
    );
  }

  if (workflow.realmId && !(await auth.canAccessRealm(workflow.realmId)))
    return forbidden();

  const exportData = {
    name: workflow.name,
    description: workflow.description,
    definition: workflow.definition,
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
