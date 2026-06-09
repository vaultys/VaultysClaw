import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound, malformed } from "@/lib/api-utils";
import { RealmDAO, UserDAO } from "@/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/realms/[id]/users — add a user to this realm. Realm admin or global admin.
 * Body: { userDid, isPrimary?, isRealmAdmin? }
 */
/**
 * @openapi
 * /api/realms/{id}/users:
 *   post:
 *     summary: Add a user to a realm.
 *     tags: [Realms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The realm ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userDid:
 *                 type: string
 *               isPrimary:
 *                 type: boolean
 *               isRealmAdmin:
 *                 type: boolean
 *             required:
 *               - userDid
 *     responses:
 *       200:
 *         description: User added to realm successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to add user to realm.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  if (!(await auth.canAdminRealm(id))) return forbidden();

  const realm = await RealmDAO.findById(id);
  if (!realm) return notFound("Realm not found");

  const body = (await req.json()) as {
    userDid?: string;
    isPrimary?: boolean;
    isRealmAdmin?: boolean;
  };
  if (!body.userDid) return malformed("userDid is required");

  const user =
    (await UserDAO.findByDid(body.userDid)) ??
    (await UserDAO.findById(body.userDid));
  if (!user) return notFound("User not found");

  await RealmDAO.addUserToRealm(
    user.id,
    id,
    body.isPrimary ?? false,
    body.isRealmAdmin ?? false
  );
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/realms/[id]/users — update a user's realm admin status. Realm admin or global admin.
 * Body: { userDid, isRealmAdmin }
 */
/**
 * @openapi
 * /api/realms/{id}/users:
 *   patch:
 *     summary: Update a user's realm admin status.
 *     tags: [Realms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Realm ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userDid:
 *                 type: string
 *                 description: User DID
 *               isRealmAdmin:
 *                 type: boolean
 *                 description: Realm admin status
 *             required:
 *               - userDid
 *               - isRealmAdmin
 *     responses:
 *       200:
 *         description: Successfully updated realm admin status.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to update realm admin status.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  if (!(await auth.canAdminRealm(id))) return forbidden();

  const body = (await req.json()) as {
    userDid?: string;
    isRealmAdmin?: boolean;
  };
  if (!body.userDid) return malformed("userDid is required");
  if (typeof body.isRealmAdmin !== "boolean")
    return malformed("isRealmAdmin (boolean) is required");

  const user =
    (await UserDAO.findByDid(body.userDid)) ??
    (await UserDAO.findById(body.userDid));
  if (!user) return notFound("User not found");

  const changed = await RealmDAO.setUserRealmAdmin(
    user.id,
    id,
    body.isRealmAdmin
  );
  if (!changed) return notFound("User is not a member of this realm");

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/realms/[id]/users — remove a user from this realm. Realm admin or global admin.
 * Body: { userDid }
 */
/**
 * @openapi
 * /api/realms/{id}/users:
 *   delete:
 *     summary: Remove a user from the specified realm.
 *     tags: [Realms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the realm.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userDid:
 *                 type: string
 *                 description: The DID of the user to remove.
 *             required:
 *               - userDid
 *     responses:
 *       200:
 *         description: User successfully removed from the realm.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to remove user from realm.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  if (!(await auth.canAdminRealm(id))) return forbidden();

  const body = (await req.json()) as { userDid?: string };
  if (!body.userDid) return malformed("userDid is required");

  const user =
    (await UserDAO.findByDid(body.userDid)) ??
    (await UserDAO.findById(body.userDid));
  if (!user) return notFound("User not found");

  const ok = await RealmDAO.removeUserFromRealm(user.id, id);
  if (!ok) return malformed("Cannot remove user from the default realm");

  return NextResponse.json({ ok: true });
}
