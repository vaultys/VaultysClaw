import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { setStorageConfig } from "@/db/settings.dao";

/**
 * PATCH /api/settings/storage/location
 * Update or clear object-storage location shown on infrastructure maps.
 * Body: { lat: number, lon: number, label?: string } or { lat: null } to clear.
 */
/**
 * @openapi
 * /api/settings/storage/location:
 *   patch:
 *     summary: Update or clear object-storage location on infrastructure maps.
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lat:
 *                 type: number
 *                 nullable: true
 *               lon:
 *                 type: number
 *               label:
 *                 type: string
 *                 nullable: true
 *             required:
 *               - lat
 *               - lon
 *     responses:
 *       200:
 *         description: Successfully updated storage location.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await request.json().catch(() => null)) as
    | { lat?: number | null; lon?: number | null; label?: string | null }
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.lat === null || body.lat === undefined) {
    await setStorageConfig({
      locationLat: null,
      locationLon: null,
      locationLabel: null,
    });
    return NextResponse.json({ ok: true });
  }

  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "lat and lon must be valid numbers" },
      { status: 400 }
    );
  }

  await setStorageConfig({
    locationLat: lat,
    locationLon: lon,
    locationLabel: body.label ?? "",
  });

  return NextResponse.json({ ok: true });
}
