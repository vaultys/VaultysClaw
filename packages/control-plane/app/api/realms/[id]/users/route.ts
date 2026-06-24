import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { RealmDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { realmsContract } from "@/lib/contracts";

/** Resolve a user by DID or internal id. */
async function findUser(didOrId: string) {
  return (
    (await UserDAO.findByDid(didOrId)) ?? (await UserDAO.findById(didOrId))
  );
}

const handlers = createNextRoute(realmsContract, {
  // ── POST /api/realms/:id/users ────────────────────────────────────────────
  addUser: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminRealm(params.id)))
      throw new APIException("FORBIDDEN");

    const realm = await RealmDAO.findById(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    const user = await findUser(body.userDid);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    await RealmDAO.addUserToRealm(
      user.id,
      params.id,
      body.isPrimary ?? false,
      body.isRealmAdmin ?? false
    );
    return { status: 200, body: { ok: true } };
  },

  // ── PATCH /api/realms/:id/users ───────────────────────────────────────────
  updateUser: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminRealm(params.id)))
      throw new APIException("FORBIDDEN");

    const user = await findUser(body.userDid);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    const changed = await RealmDAO.setUserRealmAdmin(
      user.id,
      params.id,
      body.isRealmAdmin
    );
    if (!changed)
      throw new APIException("NOT_FOUND", "User is not a member of this realm");

    return { status: 200, body: { ok: true } };
  },

  // ── DELETE /api/realms/:id/users ──────────────────────────────────────────
  removeUser: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminRealm(params.id)))
      throw new APIException("FORBIDDEN");

    const user = await findUser(body.userDid);
    if (!user) throw new APIException("NOT_FOUND", "User not found");

    const ok = await RealmDAO.removeUserFromRealm(user.id, params.id);
    if (!ok)
      throw new APIException(
        "MALFORMED",
        "Cannot remove user from the default realm"
      );

    return { status: 200, body: { ok: true } };
  },
});

export const POST = handlers.POST!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
