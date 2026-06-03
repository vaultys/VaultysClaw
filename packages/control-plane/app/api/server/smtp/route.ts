/**
 * GET  /api/server/smtp  — read SMTP config (password redacted)
 * PUT  /api/server/smtp  — save SMTP config
 * POST /api/server/smtp  — verify SMTP connection
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, forbidden, unauthorized } from "@/lib/auth-utils";
import { getSmtpConfig, saveSmtpConfig, testSmtpConnection } from "@/lib/smtp";

/**
 * @openapi
 * /api/server/smtp:
 *   get:
 *     summary: Retrieve SMTP configuration with password redacted.
 *     tags: [Server]
 *     responses:
 *       200:
 *         description: SMTP configuration retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configured:
 *                   type: boolean
 *                 host:
 *                   type: string
 *                 port:
 *                   type: integer
 *                 secure:
 *                   type: boolean
 *                 user:
 *                   type: string
 *                 password:
 *                   type: string
 *                 from:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const config = await getSmtpConfig();
  if (!config) return NextResponse.json({ configured: false });

  return NextResponse.json({
    configured: true,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    password: "••••••••",
    from: config.from,
  });
}

/**
 * @openapi
 * /api/server/smtp:
 *   put:
 *     summary: Save SMTP configuration.
 *     tags: [Server]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               host:
 *                 type: string
 *               port:
 *                 type: integer
 *               secure:
 *                 type: boolean
 *               user:
 *                 type: string
 *               password:
 *                 type: string
 *               from:
 *                 type: string
 *             required:
 *               - host
 *               - port
 *               - from
 *     responses:
 *       200:
 *         description: SMTP configuration saved successfully.
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
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    password?: string;
    from?: string;
  };

  if (!body.host || !body.port || !body.from) {
    return NextResponse.json(
      { error: "host, port and from are required" },
      { status: 400 }
    );
  }

  const existing = await getSmtpConfig();
  const password =
    body.password === "••••••••" && existing
      ? existing.password
      : (body.password ?? "");

  await saveSmtpConfig({
    host: body.host,
    port: body.port,
    secure: body.secure ?? false,
    user: body.user ?? "",
    password,
    from: body.from,
  });

  return NextResponse.json({ ok: true });
}

/**
 * @openapi
 * /api/server/smtp:
 *   post:
 *     summary: Verify SMTP connection.
 *     tags: [Server]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               host:
 *                 type: string
 *               port:
 *                 type: integer
 *               secure:
 *                 type: boolean
 *               user:
 *                 type: string
 *               password:
 *                 type: string
 *               from:
 *                 type: string
 *     responses:
 *       200:
 *         description: SMTP connection verified successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       502:
 *         description: Connection failed.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  // Accept an inline config for testing before saving
  const body = (await req.json()) as {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    password?: string;
    from?: string;
  };

  const existing = await getSmtpConfig();

  const config = {
    host: body.host ?? existing?.host ?? "",
    port: body.port ?? existing?.port ?? 587,
    secure: body.secure ?? existing?.secure ?? false,
    user: body.user ?? existing?.user ?? "",
    password:
      body.password === "••••••••" || !body.password
        ? (existing?.password ?? "")
        : body.password,
    from: body.from ?? existing?.from ?? "",
  };

  if (!config.host || !config.port) {
    return NextResponse.json({ error: "SMTP not configured" }, { status: 400 });
  }

  try {
    await testSmtpConnection(config);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Connection failed" },
      { status: 502 }
    );
  }
}
