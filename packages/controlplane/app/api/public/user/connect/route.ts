import { NextResponse } from "next/server";
import { UserLoginChannel } from "@/lib/user-login-channel";
import { isDevLoginEnabled } from "@/lib/dev-login";

/**
 * GET /api/public/user/connect — create a certificate for the classic
 * (non-WebRTC) login flow used by dev-mode "connect without the app".
 * Register vs. login is decided the same way as the QR/P2P flow: whether any
 * human Actor exists yet.
 */
export async function GET() {
  // The actual gate. Without it this route is reachable in production, and on a deployment with no
  // human Actor yet it hands an anonymous caller a registration certificate that the bootstrap flow
  // turns into `admin_console_access`. 404 rather than 403: an endpoint that does not exist in this
  // environment should not advertise that it exists in another.
  if (!isDevLoginEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const hasHuman = await UserLoginChannel.hasAnyHuman();
  const cert = hasHuman
    ? await UserLoginChannel.createConnectionCertificate()
    : await UserLoginChannel.createRegistrationCertificate();

  return NextResponse.json({ key: cert.key, token: cert.connection });
}
