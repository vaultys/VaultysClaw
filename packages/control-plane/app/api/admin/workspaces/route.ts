import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkspaceDAO, UserDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * POST /api/admin/workspaces — create a new workspace (global admin only).
 * Listing workspaces is user-facing, see app/api/(user)/workspaces/route.ts.
 */
const handlers = createNextRoute(adminContract.workspaces, {
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (!body.name.trim())
      throw new APIException("MALFORMED", "name is required");

    const slug = (body.slug ?? body.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) throw new APIException("MALFORMED", "Invalid slug");

    const existing = await WorkspaceDAO.findBySlug(slug);
    if (existing)
      throw new APIException(
        "CONFLICT",
        "A workspace with this slug already exists"
      );

    const workspace = await WorkspaceDAO.create({
      name: body.name.trim(),
      slug,
      description: body.description?.trim() || undefined,
      color: body.color,
    });

    // The creator becomes the workspace Owner.
    const creator = await UserDAO.findByDid(auth.did);
    if (creator)
      await WorkspaceDAO.addUserToWorkspace(creator.id, workspace.id, false, "Owner");

    return { status: 201, body: { workspace } };
  },
});

export const POST = handlers.POST!;
