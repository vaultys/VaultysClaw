/**
 * GET  /api/server/settings  — read connection settings (wallet URL, PeerJS host)
 * PUT  /api/server/settings  — save connection settings
 *
 * GET is public (wallet URL is needed on the login page).
 * PUT is admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, forbidden, unauthorized } from "@/lib/auth-utils";
import { getSetting, setSetting } from "@/lib/db";

/**
 * @openapi
 * /api/server/settings:
 *   get:
 *     summary: Retrieve server connection settings.
 *     tags: [Server]
 *     responses:
 *       200:
 *         description: Successful retrieval of connection settings.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 walletUrl:
 *                   type: string
 *                   example: https://wallet.vaultys.net
 *                 peerjsHost:
 *                   type: string
 *                   example: ""
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    walletUrl: getSetting("wallet_url") ?? "https://wallet.vaultys.net",
    peerjsHost: getSetting("peerjs_host") ?? "",
  });
}

/**
 * @openapi
 * /api/server/settings:
 *   put:
 *     summary: Save connection settings
 *     tags: [Server]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               walletUrl:
 *                 type: string
 *               peerjsHost:
 *                 type: string
 *     responses:
 *       200:
 *         description: Settings updated successfully
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
    walletUrl?: string;
    peerjsHost?: string;
  };

  if (body.walletUrl !== undefined) {
    setSetting("wallet_url", body.walletUrl.trim());
  }
  if (body.peerjsHost !== undefined) {
    setSetting("peerjs_host", body.peerjsHost.trim());
  }

  return NextResponse.json({ ok: true });
}
