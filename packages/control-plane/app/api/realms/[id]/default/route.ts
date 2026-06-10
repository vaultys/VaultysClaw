import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound } from "@/lib/api/utils/api-utils";
import { RealmDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/realms/[id]/default — make this realm the default. Global admin only.
 */
/**
 * @openapi
 * /api/realms/{id}/default:
 *   post:
 *     summary: Set a realm as the default.
 *     tags: [Realms]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the realm to set as default.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Realm successfully set as default.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to set default realm.
 */
export const POST = withError(async (_req: NextRequest, ctx: Ctx) => {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await ctx.params;
  const realm = await RealmDAO.findById(id);
  if (!realm) return notFound("Realm not found");

  await RealmDAO.setDefault(id);
  return NextResponse.json({ ok: true });
});
