import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkspaceDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { workspacesContract } from "@/lib/contracts";

/** Resolve a user by DID or internal id. */
async function findUser(didOrId: string) {
  return (
    (await UserDAO.findByDid(didOrId)) ?? (await UserDAO.findById(didOrId))
  );
}

const handlers = createNextRoute(workspacesContract, {
  // ── POST /api/workspaces/:id/users ────────────────────────────────────────────
  addUser: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const workspace = await WorkspaceDAO.findById(params.id);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    const user = await findUser(body.userDid);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    await WorkspaceDAO.addUserToWorkspace(
      user.id,
      params.id,
      body.isPrimary ?? false,
      body.isWorkspaceAdmin ?? false
    );
    return { status: 200, body: { ok: true } };
  },

  // ── PATCH /api/workspaces/:id/users ───────────────────────────────────────────
  updateUser: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const user = await findUser(body.userDid);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    const changed = await WorkspaceDAO.setUserWorkspaceAdmin(
      user.id,
      params.id,
      body.isWorkspaceAdmin
    );
    if (!changed)
      throw new APIException("NOT_FOUND", "User is not a member of this workspace");

    return { status: 200, body: { ok: true } };
  },

  // ── DELETE /api/workspaces/:id/users ──────────────────────────────────────────
  removeUser: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const user = await findUser(body.userDid);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    const ok = await WorkspaceDAO.removeUserFromWorkspace(user.id, params.id);
    if (!ok)
      throw new APIException(
        "MALFORMED",
        "Cannot remove user from the default workspace"
      );

    return { status: 200, body: { ok: true } };
  },
});

export const POST = handlers.POST!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
