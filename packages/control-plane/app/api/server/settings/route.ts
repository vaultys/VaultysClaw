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

export async function GET() {
  return NextResponse.json({
    walletUrl: getSetting("wallet_url") ?? "https://wallet.vaultys.net",
    peerjsHost: getSetting("peerjs_host") ?? "",
  });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await req.json()) as { walletUrl?: string; peerjsHost?: string };

  if (body.walletUrl !== undefined) {
    setSetting("wallet_url", body.walletUrl.trim());
  }
  if (body.peerjsHost !== undefined) {
    setSetting("peerjs_host", body.peerjsHost.trim());
  }

  return NextResponse.json({ ok: true });
}
