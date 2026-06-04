import { NextRequest, NextResponse } from "next/server";
import { getTemplates } from "@/lib/workflow-templates";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";

/**
 * @openapi
 * /api/workflows/templates:
 *   get:
 *     summary: Retrieve workflow templates.
 *     tags: [Workflows]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter templates by category.
 *     responses:
 *       200:
 *         description: A list of workflow templates.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 templates:
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
 *                       category:
 *                         type: string
 *                       icon:
 *                         type: string
 *                       suggestedCron:
 *                         type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get("category") || undefined;

  const templates = getTemplates(category as string | undefined);

  return NextResponse.json({
    success: true,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      icon: t.icon,
      suggestedCron: t.suggestedCron,
    })),
  });
}
