/**
 * GET /api/server/entra/unclaimed
 * List all Entra-provisioned users that have not yet claimed their account.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, forbidden, unauthorized } from "@/lib/auth-utils";
import { UserDao } from "@/lib/user-dao";

/**
 * @openapi
 * /api/server/entra/unclaimed:
 *   get:
 *     summary: List unclaimed Entra-provisioned users.
 *     tags: [Server]
 *     responses:
 *       200:
 *         description: A list of unclaimed users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       entraId:
 *                         type: string
 *                       registeredAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const users = UserDao.listUnclaimedEntra().map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    entraId: u.entra_id,
    registeredAt: u.registered_at,
  }));

  return NextResponse.json({ users });
}
