import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkflowDAO } from "@/db";
import { Prisma } from "@prisma/client";
import { workflowsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/workflows — the collection-level slice of `workflowsContract`.
 */
const handlers = createNextRoute(workflowsContract, {
  // ── GET /api/workflows ──────────────────────────────────────────────────
  list: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const { createdBy, workspaceId } = query;

    // Members can only query workspaces they belong to
    if (workspaceId && !(await auth.canAccessWorkspace(workspaceId)))
      throw new APIException("FORBIDDEN");

    let workflows = await WorkflowDAO.list({
      createdBy: createdBy ?? undefined,
      workspaceId: workspaceId ?? undefined,
    });

    // Non-admins: filter to workflows in their workspaces
    if (!auth.isGlobalAdmin) {
      workflows = workflows.filter(
        (w) => w.workspaceId && auth.workspaceIds.has(w.workspaceId)
      );
    }

    return {
      status: 200,
      body: {
        workflows: workflows,
      },
    };
  },

  // ── POST /api/workflows ─────────────────────────────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);

    const { name, description, definition } = body;
    // "default" is a client-side sentinel meaning "no explicit workspace" — let the
    // DAO resolve the actual default workspace instead of treating it as a workspace id.
    const workspaceId = body.workspaceId === "default" ? undefined : body.workspaceId;

    // If no workspaceId, must be global admin (no implicit workspace to check admin on)
    if (workspaceId) {
      if (!(await auth.canAdminWorkspace(workspaceId)))
        throw new APIException("FORBIDDEN");
    } else if (!auth.isGlobalAdmin) {
      throw new APIException("FORBIDDEN");
    }

    const workflow = await WorkflowDAO.create(
      name,
      definition as unknown as Prisma.InputJsonValue,
      undefined,
      workspaceId
    );

    if (!workflow) {
      throw new APIException("INTERNAL_ERROR", "Failed to create workflow");
    }

    return {
      status: 200,
      body: {
        workflow,
      },
    };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
