import { getAuthContext } from "@/lib/auth-utils";
import { WorkspaceDAO } from "@/db";
import { userContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/workspaces — the collection-level slice of
 * `userContract.workspaces`. Listing returns the caller's visible workspaces
 * (all for global admins). Creating a workspace is global-admin only, see
 * app/api/admin/workspaces/route.ts.
 */
const handlers = createNextRoute(userContract.workspaces, {
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
});

export const GET = handlers.GET!;
