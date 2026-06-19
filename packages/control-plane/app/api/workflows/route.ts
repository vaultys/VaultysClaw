import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, malformed } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import type { WorkflowDefinition } from "@/lib/workflow-executor";
import { Prisma } from "@prisma/client";
import { withError } from "@/lib/api/handlers/with-error";

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
export const POST = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const body = await request.json();
  const {
    name,
    description,
    definition,
    realmId: rawRealmId,
  } = body as {
    name?: string;
    description?: string;
    definition?: WorkflowDefinition;
    realmId?: string;
  };
  // "default" is a client-side sentinel meaning "no explicit realm" — let the
  // DAO resolve the actual default realm instead of treating it as a realm id.
  const realmId = rawRealmId === "default" ? undefined : rawRealmId;

  if (!name || typeof name !== "string") {
    return malformed("name (string) is required");
  }
  if (!definition || typeof definition !== "object") {
    return malformed("definition (object) is required");
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
});

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
export const GET = withError(async (request: NextRequest) => {
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
    workflows = workflows.filter(
      (w) => w.realmId && auth.realmIds.has(w.realmId)
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
});
