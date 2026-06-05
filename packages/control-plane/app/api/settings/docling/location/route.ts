import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { getDoclingConfig, setDoclingConfig } from "@/db/settings.dao";

/**
 * PATCH /api/settings/docling/location
 * Update or clear Docling service location shown on infrastructure maps.
 * Body: { lat: number, lon: number, label?: string } or { lat: null } to clear.
 */
/**
 * @openapi
 * /api/settings/docling/location:
 *   patch:
 *     summary: Update or clear Docling service location on maps.
 *     tags: [Settings]
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
 *                     nullable: true
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

  const cfg = await getDoclingConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Docling is not configured" },
      { status: 400 }
    );
  }

  if (body.lat === null || body.lat === undefined) {
    await setDoclingConfig({
      url: cfg.url,
      enabled: cfg.enabled,
      sourceEndpoint: cfg.sourceEndpoint,
      fileEndpoint: cfg.fileEndpoint,
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

  await setDoclingConfig({
    url: cfg.url,
    enabled: cfg.enabled,
    sourceEndpoint: cfg.sourceEndpoint,
    fileEndpoint: cfg.fileEndpoint,
    locationLat: lat,
    locationLon: lon,
    locationLabel: body.label ?? "",
  });

  return NextResponse.json({ ok: true });
}
