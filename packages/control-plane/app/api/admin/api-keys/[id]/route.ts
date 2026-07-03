import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ApiKeyDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { adminContract } from "@/lib/contracts";
import { toApiKey } from "@/lib/api/utils/api-key-utils";

const handlers = createNextRoute(adminContract.apiKeys, {
  // ── PATCH /api/admin/api-keys/:id ─────────────────────────────────────────
  update: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const existing = await ApiKeyDAO.findById(params.id);
    if (!existing) throw new APIException("NOT_FOUND", "API key not found");

    const data: {
      name?: string;
      allowedRoutes?: string[];
      workspaceId?: string | null;
      isWorkspaceAdmin?: boolean;
      expiresAt?: Date | null;
      isActive?: boolean;
    } = {};

    if (body.name !== undefined) {
      if (!body.name.trim()) throw new APIException("MALFORMED", "name cannot be empty");
      data.name = body.name.trim();
    }
    if (body.allowedRoutes !== undefined) {
      if (!Array.isArray(body.allowedRoutes) || body.allowedRoutes.length === 0)
        throw new APIException("MALFORMED", "allowedRoutes must be a non-empty array");
      data.allowedRoutes = body.allowedRoutes;
    }
    if (body.workspaceId !== undefined) data.workspaceId = body.workspaceId ?? null;
    if (body.isWorkspaceAdmin !== undefined) data.isWorkspaceAdmin = body.isWorkspaceAdmin;
    if (body.expiresAt !== undefined)
      data.expiresAt = body.expiresAt ? new Date(body.expiresAt * 1000) : null;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    if (Object.keys(data).length === 0)
      throw new APIException("MALFORMED", "No fields to update");

    const updated = await ApiKeyDAO.update(params.id, data);
    return { status: 200, body: toApiKey(updated) };
  },

  // ── DELETE /api/admin/api-keys/:id ────────────────────────────────────────
  remove: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const deleted = await ApiKeyDAO.delete(params.id);
    if (!deleted) throw new APIException("NOT_FOUND", "API key not found");
    return { status: 204, body: undefined };
  },
});

export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
