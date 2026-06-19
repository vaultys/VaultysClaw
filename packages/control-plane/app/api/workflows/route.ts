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

    const { createdBy, realmId } = query;

    // Members can only query realms they belong to
    if (realmId && !(await auth.canAccessRealm(realmId)))
      throw new APIException("FORBIDDEN");

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

    return {
      status: 200,
      body: {
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
      },
    };
  },

  // ── POST /api/workflows ─────────────────────────────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);

    const { name, description, definition } = body;
    // "default" is a client-side sentinel meaning "no explicit realm" — let the
    // DAO resolve the actual default realm instead of treating it as a realm id.
    const realmId = body.realmId === "default" ? undefined : body.realmId;

    // If no realmId, must be global admin (no implicit realm to check admin on)
    if (realmId) {
      if (!(await auth.canAdminRealm(realmId))) throw new APIException("FORBIDDEN");
    } else if (!auth.isGlobalAdmin) {
      throw new APIException("FORBIDDEN");
    }

    const id = await WorkflowDAO.create(
      name,
      definition as unknown as Prisma.InputJsonValue,
      undefined,
      realmId
    );

    return {
      status: 200,
      body: {
        success: true,
        id,
        name,
        description,
        realmId: realmId || "default",
      },
    };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
