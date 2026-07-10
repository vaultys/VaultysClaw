import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { WorkspaceDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";
import { enqueueNotification } from "@/lib/notification-queue";

/** Resolve a user by DID or internal id. */
async function findUser(didOrId: string) {
  return (
    (await UserDAO.findByDid(didOrId)) ?? (await UserDAO.findById(didOrId))
  );
}

const handlers = createNextRoute(userContract.workspaces, {
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
      body.role ?? "Member"
    );
    void enqueueNotification({
      eventType: "workspace.member_added",
      data: {
        targetUserId: user.id,
        workspaceId: params.id,
        workspaceName: workspace.name,
        actorDid: auth.did,
      },
    });
    return { status: 200, body: { ok: true } };
  },

  // ── PATCH /api/workspaces/:id/users ───────────────────────────────────────────
  updateUser: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const user = await findUser(body.userDid);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    // A workspace admin cannot strip their own rights by changing their own role.
    if (user.did === auth.did)
      throw new APIException(
        "FORBIDDEN",
        "You cannot change your own workspace role"
      );

    // The Owner's role cannot be changed here — use ownership transfer instead.
    const current = await WorkspaceDAO.getWorkspaceRole(user.id, params.id);
    if (current === null)
      throw new APIException("NOT_FOUND", "User is not a member of this workspace");
    if (current === "Owner")
      throw new APIException(
        "FORBIDDEN",
        "Cannot change the workspace owner's role — transfer ownership instead"
      );

    await WorkspaceDAO.setWorkspaceRole(user.id, params.id, body.role);
    return { status: 200, body: { ok: true } };
  },

  // ── DELETE /api/workspaces/:id/users ──────────────────────────────────────────
  removeUser: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const user = await findUser(body.userDid);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    // A workspace admin cannot remove themselves (that would strip their own rights).
    if (user.did === auth.did)
      throw new APIException(
        "FORBIDDEN",
        "You cannot remove yourself from the workspace"
      );

    const role = await WorkspaceDAO.getWorkspaceRole(user.id, params.id);
    if (role === "Owner")
      throw new APIException(
        "MALFORMED",
        "Cannot remove the workspace owner — transfer ownership first"
      );

    const ok = await WorkspaceDAO.removeUserFromWorkspace(user.id, params.id);
    if (!ok)
      throw new APIException(
        "MALFORMED",
        "Cannot remove user from the default workspace"
      );

    const workspace = await WorkspaceDAO.findById(params.id);
    void enqueueNotification({
      eventType: "workspace.member_removed",
      data: {
        targetUserId: user.id,
        workspaceId: params.id,
        workspaceName: workspace?.name,
        actorDid: auth.did,
      },
    });

    return { status: 200, body: { ok: true } };
  },
});

export const POST = handlers.POST!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
