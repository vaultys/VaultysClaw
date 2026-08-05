import { NextResponse } from "next/server";
import { InvitationDAO } from "@/db";

/**
 * GET /api/public/invite/[token] — pre-flight check the redemption page calls before starting any
 * crypto exchange, so a dead link fails immediately with a specific reason instead of only
 * discovering it's unusable after generating a QR code (the old package's flagged gap — see
 * packages/controlplane/CLAUDE.md "Human onboarding via invite").
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const invitation = await InvitationDAO.findByToken(token);

  if (!invitation) {
    return NextResponse.json({ valid: false, reason: "not_found" });
  }
  if (invitation.redeemedAt) {
    return NextResponse.json({ valid: false, reason: "redeemed" });
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ valid: false, reason: "expired" });
  }
  return NextResponse.json({ valid: true, name: invitation.name });
}
