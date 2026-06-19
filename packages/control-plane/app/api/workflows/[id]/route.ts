import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import { Prisma } from "@prisma/client";
import { workflowsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/workflows/:id — the item-level slice of `workflowsContract`.
 */
const handlers = createNextRoute(workflowsContract, {
  // ── GET /api/workflows/:id ──────────────────────────────────────────────
  getOne: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const workflow = await WorkflowDAO.findById(params.id);
    if (!workflow) throw new APIException("NOT_FOUND", "Workflow not found");

    if (workflow.realmId && !(await auth.canAccessRealm(workflow.realmId)))
      throw new APIException("FORBIDDEN");

    return {
      status: 200,
      body: {
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
      },
    };
  },

  // ── PATCH /api/workflows/:id ────────────────────────────────────────────
  update: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const workflow = await WorkflowDAO.findById(params.id);
    if (!workflow) throw new APIException("NOT_FOUND", "Workflow not found");

    if (workflow.realmId && !(await auth.canAdminRealm(workflow.realmId)))
      throw new APIException("FORBIDDEN");
    if (!workflow.realmId && !auth.isGlobalAdmin)
      throw new APIException("FORBIDDEN");

    const { name, definition, description, realmId } = body;

    if (!name && !definition && !description && !realmId) {
      throw new APIException(
        "MALFORMED",
        "At least one of name, definition, description, or realmId is required"
      );
    }

    await WorkflowDAO.update(params.id, {
      name,
      definition: definition as unknown as Prisma.InputJsonValue,
      description,
      realmId,
    });

    return { status: 200, body: { success: true, id: params.id } };
  },

  // ── DELETE /api/workflows/:id ───────────────────────────────────────────
  remove: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const workflow = await WorkflowDAO.findById(params.id);
    if (!workflow) throw new APIException("NOT_FOUND", "Workflow not found");

    if (workflow.realmId && !(await auth.canAdminRealm(workflow.realmId)))
      throw new APIException("FORBIDDEN");
    if (!workflow.realmId && !auth.isGlobalAdmin)
      throw new APIException("FORBIDDEN");

    await WorkflowDAO.delete(params.id);

    return { status: 200, body: { success: true, id: params.id } };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
