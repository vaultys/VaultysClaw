import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkspaceDAO, UserDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/workspaces — the collection-level slice of `adminContract.workspaces`.
 *
 * The contract (lib/contracts/workspaces.contract.ts) is the single source of
 * truth for request/response shapes; `createNextRoute` validates inputs and
 * type-checks every `{ status, body }` returned below against it.
 */
const handlers = createNextRoute(adminContract.workspaces, {
  // ── GET /api/workspaces — list workspaces with member/workflow counts ────────────
  list: async ({ request, query }) => {
    const auth = await getAuthContext(request);

    const allWorkspaces = await WorkspaceDAO.findAll(query.userId);

    // Filter by workspace membership using the auth context's precomputed set
    // (which correctly uses the DB userId, not the VaultysID DID string).
    const visibleWorkspaces = auth.isGlobalAdmin
      ? allWorkspaces
      : (
          await Promise.all(
            allWorkspaces.map((r) =>
              auth.canAccessWorkspace(r.id).then((ok) => (ok ? r : null))
            )
          )
        ).filter((r): r is NonNullable<typeof r> => r !== null);

    return { status: 200, body: { workspaces: visibleWorkspaces } };
  },

  // ── POST /api/workspaces — create a new workspace (global admin only) ─────────────
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

export const GET = handlers.GET!;
export const POST = handlers.POST!;
