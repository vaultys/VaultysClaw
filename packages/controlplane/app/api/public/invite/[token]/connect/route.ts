import { NextResponse } from "next/server";
import { UserLoginChannel } from "@/lib/user-login-channel";

/**
 * GET /api/public/invite/[token]/connect — the dev-mode "connect without the app" counterpart to
 * app/api/public/user/connect/route.ts, scoped to one invitation. Always registers, same reasoning
 * as the p2p-connect route above.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const cert = await UserLoginChannel.createRegistrationCertificate(token);
  return NextResponse.json({ key: cert.key, token: cert.connection });
}
