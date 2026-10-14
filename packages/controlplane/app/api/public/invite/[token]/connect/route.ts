import { NextResponse } from "next/server";
import { UserLoginChannel } from "@/lib/user-login-channel";
import { InvitationDAO } from "@/db";

/**
 * GET /api/public/invite/[token]/connect — the dev-mode "connect without the app" counterpart to
 * app/api/public/user/connect/route.ts, scoped to one invitation. Always registers, same reasoning
 * as the p2p-connect route above. Same up-front invitation check as that route, for the same reason.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!(await InvitationDAO.findValidByToken(token))) {
    return new NextResponse(null, { status: 404 });
  }
  const cert = await UserLoginChannel.createRegistrationCertificate(token);
  return NextResponse.json({ key: cert.key, token: cert.connection });
}
