/**
 * GET  /api/server/entra  — read Entra config (secret redacted)
 * PUT  /api/server/entra  — save Entra config
 * POST /api/server/entra  — test connectivity (list groups)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, forbidden, unauthorized } from "@/lib/auth-utils";
import {
  getEntraConfig,
  saveEntraConfig,
  listEntraGroups,
  diagnoseEntraConfig,
} from "@/lib/entra-sync";

/**
 * @openapi
 * /api/server/entra:
 *   get:
 *     summary: Retrieve the Entra configuration with secrets redacted.
 *     tags: [Server]
 *     responses:
 *       200:
 *         description: Successfully retrieved Entra configuration.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configured:
 *                   type: boolean
 *                 tenantId:
 *                   type: string
 *                 clientId:
 *                   type: string
 *                 clientSecret:
 *                   type: string
 *                   example: "••••••••"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const config = getEntraConfig();
  if (!config) return NextResponse.json({ configured: false });

  return NextResponse.json({
    configured: true,
    tenantId: config.tenantId,
    clientId: config.clientId,
    clientSecret: "••••••••",
  });
}

/**
 * @openapi
 * /api/server/entra:
 *   put:
 *     summary: Save Entra configuration.
 *     tags: [Server]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tenantId:
 *                 type: string
 *               clientId:
 *                 type: string
 *               clientSecret:
 *                 type: string
 *             required:
 *               - tenantId
 *               - clientId
 *               - clientSecret
 *     responses:
 *       200:
 *         description: Configuration saved successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function PUT(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await req.json()) as {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
  };

  if (!body.tenantId || !body.clientId || !body.clientSecret) {
    return NextResponse.json(
      { error: "tenantId, clientId and clientSecret are required" },
      { status: 400 }
    );
  }

  // If secret is the redacted placeholder, keep the existing one
  const existing = getEntraConfig();
  const secret =
    body.clientSecret === "••••••••" && existing
      ? existing.clientSecret
      : body.clientSecret;

  saveEntraConfig({
    tenantId: body.tenantId,
    clientId: body.clientId,
    clientSecret: secret,
  });
  return NextResponse.json({ ok: true });
}

/**
 * @openapi
 * /api/server/entra:
 *   post:
 *     summary: Test connectivity and list Entra groups.
 *     tags: [Server]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tenantId:
 *                 type: string
 *               clientId:
 *                 type: string
 *               clientSecret:
 *                 type: string
 *     responses:
 *       200:
 *         description: Connectivity test results and group list.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 checks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       status:
 *                         type: string
 *                       message:
 *                         type: string
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                 error:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  // Accept an inline config (unsaved) so the UI can test before saving
  const body = (await req.json().catch(() => ({}))) as {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
  };

  const saved = getEntraConfig();
  const config = {
    tenantId: body.tenantId ?? saved?.tenantId ?? "",
    clientId: body.clientId ?? saved?.clientId ?? "",
    clientSecret:
      body.clientSecret && body.clientSecret !== "••••••••"
        ? body.clientSecret
        : (saved?.clientSecret ?? ""),
  };

  if (!config.tenantId || !config.clientId || !config.clientSecret) {
    return NextResponse.json(
      { error: "Entra credentials are not configured" },
      { status: 400 }
    );
  }

  // Always run diagnostics first
  const checks = await diagnoseEntraConfig(config);
  const allOk = checks.every((c) => c.status === "ok");

  if (!allOk) {
    return NextResponse.json({ ok: false, checks }, { status: 200 });
  }

  // All checks passed — also return the group list so the wizard can use it
  try {
    const groups = await listEntraGroups();
    return NextResponse.json({ ok: true, checks, groups });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        checks,
        error: err instanceof Error ? err.message : "Failed to list groups",
      },
      { status: 200 }
    );
  }
}
