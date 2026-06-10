/**
 * GET /api/users/[did]/realms — list realms the user belongs to, plus all available realms.
 * Requires global admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { RealmDAO, UserDAO } from "@/db";
import { forbidden, notFound } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * @openapi
 * /api/users/{did}/realms:
 *   get:
 *     summary: List realms the user belongs to and all available realms.
 *     tags: [Users]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The decentralized identifier of the user.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of user memberships and available realms.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 memberships:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       realmId:
 *                         type: string
 *                       realmName:
 *                         type: string
 *                       realmSlug:
 *                         type: string
 *                       realmColor:
 *                         type: string
 *                       isDefault:
 *                         type: boolean
 *                       isPrimary:
 *                         type: boolean
 *                       isRealmAdmin:
 *                         type: boolean
 *                       joinedAt:
 *                         type: string
 *                         format: date-time
 *                 available:
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
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET = withError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return forbidden();
  }

  const { did } = await params;
  const user = (await UserDAO.findByDid(did)) ?? (await UserDAO.findById(did));
  if (!user) {
    return notFound("User not found");
  }

  const [memberships, allRealms] = await Promise.all([
    RealmDAO.getUserRealms(user.id),
    RealmDAO.findAll(),
  ]);

  const memberRealmIds = new Set(memberships.map((m) => m.realmId));

  return NextResponse.json({
    memberships: memberships.map((m) => ({
      realmId: m.realmId,
      realmName: m.realm.name,
      realmSlug: m.realm.slug,
      realmColor: m.realm.color,
      isDefault: m.realm.isDefault,
      isPrimary: m.isPrimary,
      isRealmAdmin: m.isRealmAdmin,
      joinedAt: m.joinedAt,
    })),
    available: allRealms
      .filter((r) => !memberRealmIds.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, slug: r.slug, color: r.color })),
  });
});
