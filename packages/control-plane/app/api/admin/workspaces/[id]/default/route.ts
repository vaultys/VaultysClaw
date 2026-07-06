import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkspaceDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/admin/workspaces/:id/default — the `setDefault` slice of `adminContract.workspaces`.
 */
const handlers = createNextRoute(adminContract.workspaces, {
  // ── POST /api/admin/workspaces/:id/default — make this workspace the default ────────────
  setDefault: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const workspace = await WorkspaceDAO.findById(params.id);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    await WorkspaceDAO.setDefault(params.id);
    return { status: 200, body: { ok: true } };
  },
});

export const POST = handlers.POST!;
