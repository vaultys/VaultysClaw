import { NextRequest, NextResponse } from "next/server";
import { getTemplate } from "@/lib/workflow-templates";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized } from "@/lib/api-utils";

/**
 * @openapi
 * /api/workflows/templates/{templateId}:
 *   get:
 *     summary: Retrieve a workflow template by ID.
 *     tags: [Workflows]
 *     parameters:
 *       - name: templateId
 *         in: path
 *         required: true
 *         description: The ID of the workflow template.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved the workflow template.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 template:
 *                   type: object
 *                   additionalProperties: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { templateId } = await params;
  const template = getTemplate(templateId);

  if (!template) {
    return NextResponse.json(
      { success: false, error: "Template not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    template,
  });
}
