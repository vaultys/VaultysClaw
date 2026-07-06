import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import { Prisma } from "@prisma/client";
import {
  userContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/workflows/:id — the item-level slice of `userContract.workflows`.
 */
const handlers = createNextRoute(userContract.workflows, {
  // ── GET /api/workflows/:id ──────────────────────────────────────────────
  getOne: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const workflow = await WorkflowDAO.findById(params.id);
    if (!workflow) throw new APIException("NOT_FOUND", "Workflow not found");

    if (workflow.workspaceId && !(await auth.canAccessWorkspace(workflow.workspaceId)))
      throw new APIException("FORBIDDEN");

    return {
      status: 200,
      body: {
        workflow,
      },
    };
  },

  // ── PATCH /api/workflows/:id ────────────────────────────────────────────
  update: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const workflow = await WorkflowDAO.findById(params.id);
    if (!workflow) throw new APIException("NOT_FOUND", "Workflow not found");

    if (workflow.workspaceId && !(await auth.canAdminWorkspace(workflow.workspaceId)))
      throw new APIException("FORBIDDEN");
    if (!workflow.workspaceId && !auth.isGlobalAdmin)
      throw new APIException("FORBIDDEN");

    const { name, definition, description, workspaceId } = body;

    if (!name && !definition && !description && !workspaceId) {
      throw new APIException(
        "MALFORMED",
        "At least one of name, definition, description, or workspaceId is required"
      );
    }

    const updatedWorkflow = await WorkflowDAO.update(params.id, {
      name,
      definition: definition as unknown as Prisma.InputJsonValue,
      description,
      workspaceId,
    });

    return { status: 200, body: { workflow: updatedWorkflow } };
  },

  // ── DELETE /api/workflows/:id ───────────────────────────────────────────
  remove: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const workflow = await WorkflowDAO.findById(params.id);
    if (!workflow) throw new APIException("NOT_FOUND", "Workflow not found");

    if (workflow.workspaceId && !(await auth.canAdminWorkspace(workflow.workspaceId)))
      throw new APIException("FORBIDDEN");
    if (!workflow.workspaceId && !auth.isGlobalAdmin)
      throw new APIException("FORBIDDEN");

    const deletedWorkflow = await WorkflowDAO.delete(params.id);

    return { status: 200, body: { workflow: deletedWorkflow } };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
