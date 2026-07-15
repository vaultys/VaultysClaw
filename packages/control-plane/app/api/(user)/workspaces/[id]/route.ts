import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkspaceDAO } from "@/db";
import { userContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { enqueueNotification } from "@/lib/notification-queue";

/**
 * Routes for /api/workspaces/:id — the workspace-detail slice of `userContract.workspaces`.
 *
 * The contract (lib/contracts/admin/workspaces/workspaces.contract.ts) is the single source
 * of truth for request/response shapes; `createNextRoute` validates inputs and
 * type-checks every `{ status, body }` returned below against it.
 */
const handlers = createNextRoute(userContract.workspaces, {
  // ── GET /api/workspaces/:id — full workspace detail (single query) ────────────────
  getOne: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const workspace = await WorkspaceDAO.getDetail(params.id);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    if (!(await auth.canAccessWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    return { status: 200, body: workspace };
  },

  // ── PATCH /api/workspaces/:id — update metadata or config (workspace owner) ──────
  update: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canOwnWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const existing = await WorkspaceDAO.findById(params.id);
    if (!existing) throw new APIException("NOT_FOUND", "Workspace not found");

    const updates: Parameters<typeof WorkspaceDAO.update>[1] = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.color !== undefined) updates.color = body.color;
    if ("llmConfig" in body)
      updates.llmConfig = (body.llmConfig as any) ?? null;
    if (body.defaultCapabilities !== undefined)
      updates.defaultCapabilities = body.defaultCapabilities;
    if ("tokenBudgetDaily" in body)
      updates.tokenBudgetDaily = body.tokenBudgetDaily ?? null;
    if ("tokenBudgetMonthly" in body)
      updates.tokenBudgetMonthly = body.tokenBudgetMonthly ?? null;
    if ("allowedCapabilities" in body)
      updates.allowedCapabilities = body.allowedCapabilities ?? null;

    await WorkspaceDAO.update(params.id, updates);
    const workspace = await WorkspaceDAO.findById(params.id);

    return { status: 200, body: workspace! };
  },

  // ── DELETE /api/workspaces/:id — delete a workspace (workspace owner, not the default one) ─
  remove: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canOwnWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const workspace = await WorkspaceDAO.findById(params.id);

    const ok = await WorkspaceDAO.delete(params.id);
    if (!ok)
      throw new APIException("CONFLICT", "Cannot delete the default workspace");

    void enqueueNotification({
      eventType: "workspace.deleted",
      data: {
        workspaceId: params.id,
        workspaceName: workspace?.name,
        actorDid: auth.did,
      },
    });

    return { status: 200, body: { ok: true } };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
