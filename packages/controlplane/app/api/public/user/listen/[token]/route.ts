import { NextResponse } from "next/server";
import { UserLoginChannel } from "@/lib/user-login-channel";

/**
 * GET /api/public/user/listen/[token] — poll a login attempt's status.
 * -1 pending, 2 success, -2 failed.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const cert = await UserLoginChannel.listen(token);
  return NextResponse.json({ status: cert?.status ?? -1 });
}
