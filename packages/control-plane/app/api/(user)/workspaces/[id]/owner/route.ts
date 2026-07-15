import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkspaceDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

/** Resolve a user by DID or internal id. */
async function findUser(didOrId: string) {
  return (
    (await UserDAO.findByDid(didOrId)) ?? (await UserDAO.findById(didOrId))
  );
}

const handlers = createNextRoute(userContract.workspaces, {
  // ── POST /api/workspaces/:id/owner ────────────────────────────────────────────
  transferOwner: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    // Only the current owner (or a global admin) may transfer ownership.
    if (!(await auth.canOwnWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const workspace = await WorkspaceDAO.findById(params.id);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    const user = await findUser(body.userDid);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    const ok = await WorkspaceDAO.transferOwnership(params.id, user.id);
    if (!ok)
      throw new APIException(
        "MALFORMED",
        "The new owner must already be a member of this workspace"
      );

    return { status: 200, body: { ok: true } };
  },
});

export const POST = handlers.POST!;
