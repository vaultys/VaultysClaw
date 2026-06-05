import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized } from "@/lib/api-utils";
import { RealmDAO, UserDAO } from "@/db";

/**
 * GET /api/me/realms
 * Get realms the current user belongs to (for channel creation)
 * Resolves the user's UUID from their DID since user_realms uses users.id (UUID)
 */
/**
 * @openapi
 * /api/me/realms:
 *   get:
 *     summary: Get realms the current user belongs to.
 *     tags: [Me]
 *     responses:
 *       200:
 *         description: A list of realms the user belongs to.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 realms:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       slug:
 *                         type: string
 *                       color:
 *                         type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Failed to fetch realms.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    // user_realms.user_id references users.id (UUID), not users.did
    // Resolve UUID from the session DID
    const user = await UserDAO.findByDid(auth.did);
    const userId = user?.id ?? auth.did;

    const rows = await RealmDAO.getUserRealms(userId);

    const realms = rows.map((r) => ({
      id: r.realm.id,
      name: r.realm.name,
      slug: r.realm.slug,
      color: r.realm.color,
    }));

    return NextResponse.json({ realms });
  } catch (err) {
    console.error("GET /api/me/realms error:", err);
    return NextResponse.json(
      { error: "Failed to fetch realms" },
      { status: 500 }
    );
  }
}
