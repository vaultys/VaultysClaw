import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  malformed,
  notFound,
} from "@/lib/api/utils/api-utils";
import { UserDAO } from "@/db";

/**
 * PATCH /api/users/[did]/location
 * Set or clear the geographic location of a user. Admin-only.
 * Body: { lat: number, lon: number, label: string } or { lat: null } to clear.
 */
/**
 * @openapi
 * /api/users/{did}/location:
 *   patch:
 *     summary: Set or clear the geographic location of a user.
 *     tags: [Users]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The decentralized identifier of the user.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lon:
 *                     type: number
 *                   label:
 *                     type: string
 *               - type: object
 *                 properties:
 *                   lat:
 *                     type: null
 *     responses:
 *       200:
 *         description: Location updated successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did } = await params;
  const body = await req.json().catch(() => null);
  if (!body) {
    return malformed("Invalid JSON body");
  }

  const user = (await UserDAO.findByDid(did)) ?? (await UserDAO.findById(did));
  if (!user) {
    return notFound("User not found");
  }

  if (body.lat === null || body.lat === undefined) {
    await UserDAO.updateLocation(user.id, null);
  } else {
    const lat = parseFloat(body.lat);
    const lon = parseFloat(body.lon);
    const label = String(body.label ?? "");
    if (isNaN(lat) || isNaN(lon)) {
      return malformed("lat and lon must be valid numbers");
    }
    await UserDAO.updateLocation(user.id, { lat, lon, label });
  }

  return NextResponse.json({ ok: true });
}
