import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";
import { UserDao } from "@/lib/user-dao";

/**
 * GET /api/user/connect
 * Creates a new certificate for the connection flow.
 * Returns the raw key (hex) so the browser can build the VaultysID QR URL.
 *
 * Query params:
 *   - register=true  → registration/claim cert (for first-time users)
 *   - register=false → login cert (default)
 */
export async function GET(request: NextRequest) {
  const isRegister = request.nextUrl.searchParams.get("register") === "true";
  const shouldRegister = isRegister || !UserDao.hasAnyUser();

  const cert = shouldRegister
    ? UserServerChannel.createRegistrationCertificate()
    : UserServerChannel.createConnectionCertificate();

  return NextResponse.json({ key: cert.key, token: cert.connection });
}
