/**
 * GET /api/server/entra/unclaimed
 * List all Entra-provisioned users that have not yet claimed their account.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { forbidden, unauthorized } from "@/lib/api-utils";
import { UserDAO } from "@/db";

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
 *                       claimedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const users = (await UserDAO.listUnclaimed()).map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    entraId: u.entraId,
    registeredAt: u.registeredAt,
    claimedAt: u.claimedAt,
  }));

  return NextResponse.json({ users });
}
