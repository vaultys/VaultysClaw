import { NextResponse } from "next/server";
import { UserLoginChannel } from "@/lib/user-login-channel";

/**
 * GET /api/public/user/listen/[token] — poll a login attempt's status.
 * -1 pending, 2 success, -2 failed. Once a brand-new dev-mode registration
 * bootstraps the first admin, `certRound` carries the key for the *second*
 * live SRP exchange the client must run to actually claim
 * `admin_console_access` (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b) — null for
 * every other login.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const cert = await UserLoginChannel.listen(token);
  const meta = JSON.parse(cert?.metadata ?? "{}") as { certRound?: { key: string } };
  return NextResponse.json({ status: cert?.status ?? -1, certRound: meta.certRound ?? null });
}
