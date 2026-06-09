import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, malformed } from "@/lib/api/utils/api-utils";
import { getDoclingConfig, setDoclingConfig } from "@/db/settings.dao";

// GET /api/settings/docling
/**
 * @openapi
 * /api/settings/docling:
 *   get:
 *     summary: Retrieve the Docling configuration settings.
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Successfully retrieved Docling configuration.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                 enabled:
 *                   type: boolean
 *                 configured:
 *                   type: boolean
 *                 sourceEndpoint:
 *                   type: string
 *                   nullable: true
 *                 fileEndpoint:
 *                   type: string
 *                   nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const cfg = await getDoclingConfig();
  return NextResponse.json({
    url: cfg?.url ?? "",
    enabled: cfg?.enabled ?? false,
    configured: !!cfg?.url,
    sourceEndpoint: cfg?.sourceEndpoint ?? null,
    fileEndpoint: cfg?.fileEndpoint ?? null,
  });
}

// PUT /api/settings/docling
/**
 * @openapi
 * /api/settings/docling:
 *   put:
 *     summary: Update the Docling configuration settings.
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 description: The URL for the Docling service.
 *               enabled:
 *                 type: boolean
 *                 description: Flag to enable or disable Docling.
 *     responses:
 *       200:
 *         description: Docling configuration updated successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await request.json()) as { url?: string; enabled?: boolean };
  const url = (body.url ?? "").trim().replace(/\/$/, "");
  const enabled = body.enabled ?? false;

  if (enabled && !url) {
    return malformed("URL is required when enabling Docling");
  }

  await setDoclingConfig({ url, enabled });
  return NextResponse.json({ ok: true });
}
