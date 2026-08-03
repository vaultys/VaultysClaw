import { NextResponse } from "next/server";
import { UserLoginChannel } from "@/lib/user-login-channel";

/**
 * GET /api/public/user/connect — create a certificate for the classic
 * (non-WebRTC) login flow used by dev-mode "connect without the app".
 * Register vs. login is decided the same way as the QR/P2P flow: whether any
 * human Principal exists yet.
 */
export async function GET() {
  const hasHuman = await UserLoginChannel.hasAnyHuman();
  const cert = hasHuman
    ? await UserLoginChannel.createConnectionCertificate()
    : await UserLoginChannel.createRegistrationCertificate();

  return NextResponse.json({ key: cert.key, token: cert.connection });
}
