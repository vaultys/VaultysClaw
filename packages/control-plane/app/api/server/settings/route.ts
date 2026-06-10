/**
 * GET  /api/server/settings  — read connection settings (wallet URL, PeerJS host)
 * PUT  /api/server/settings  — save connection settings
 *
 * GET is public (wallet URL is needed on the login page).
 * PUT is admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { forbidden, unauthorized } from "@/lib/api/utils/api-utils";
import { SettingsDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";

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
export const GET = withError(async (request: NextRequest) => {
  return NextResponse.json({
    walletUrl:
      (await SettingsDAO.get("wallet_url")) ?? "https://wallet.vaultys.net",
    peerjsHost: (await SettingsDAO.get("peerjs_host")) ?? "",
  });
});

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
export const PUT = withError(async (req: NextRequest) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await req.json()) as {
    walletUrl?: string;
    peerjsHost?: string;
  };

  if (body.walletUrl !== undefined) {
    await SettingsDAO.set("wallet_url", body.walletUrl.trim());
  }
  if (body.peerjsHost !== undefined) {
    await SettingsDAO.set("peerjs_host", body.peerjsHost.trim());
  }

  return NextResponse.json({ ok: true });
});
