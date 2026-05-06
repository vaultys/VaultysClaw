import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";

/**
 * POST /api/user/bastion/associate
 * Links a completed browser-device certificate with a completed user certificate,
 * confirming that the user who authenticated via QR also owns the browser device.
 *
 * Body: { userToken: string, browserToken: string }
 *   - userToken: raw key from the user's connection certificate
 *   - browserToken: raw key from the browser device certificate
 *
 * Returns { ok: true } on success.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userToken, browserToken } = body as { userToken: string; browserToken: string };

  if (!userToken || !browserToken) {
    return NextResponse.json({ error: "userToken and browserToken are required" }, { status: 400 });
  }

  const userCert = UserServerChannel.connecting(userToken);
  const browserCert = UserServerChannel.connecting(browserToken);

  if (!userCert || !browserCert) {
    return NextResponse.json({ error: "Invalid tokens" }, { status: 400 });
  }

  if (userCert.status !== 2 || browserCert.status !== 2) {
    return NextResponse.json({ error: "Both certificates must be completed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
