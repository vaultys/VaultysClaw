import { NextRequest, NextResponse } from "next/server";
import { getRealmById, setDefaultRealm } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

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
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await ctx.params;
    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Realm not found" }, { status: 404 });

    setDefaultRealm(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to set default realm" }, { status: 500 });
  }
}
