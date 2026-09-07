import { NextResponse } from "next/server";
import { UserLoginChannel } from "@/lib/user-login-channel";
import { isBrowserBootstrapEnabled } from "@/lib/browser-bootstrap";

/**
 * GET /api/public/user/connect — create a certificate for the classic
 * (non-WebRTC) login flow used by "sign in with a key in this browser".
 * Register vs. login is decided the same way as the QR/P2P flow: whether any
 * human Actor exists yet.
 *
 * The gate is on the **register** branch only, not the route. Handing an
 * anonymous caller a *registration* certificate on a deployment with no human
 * Actor yet is what let whoever found this endpoint first become the
 * administrator (see `lib/browser-bootstrap.ts`); handing them a *connection*
 * certificate is not, because completing it proves possession of an already
 * registered DID's key and `loginHuman` rejects every other DID. Gating the
 * whole route instead — which is what this did — also locked out the humans SSO
 * registration gives a browser-held key to, since that key is the only
 * credential they have.
 *
 * 404 rather than 403 on the closed branch: an endpoint that does not exist in
 * this environment should not advertise that it exists in another.
 */
export async function GET() {
  const hasHuman = await UserLoginChannel.hasAnyHuman();

  if (!hasHuman) {
    if (!isBrowserBootstrapEnabled()) return new NextResponse(null, { status: 404 });
    const cert = await UserLoginChannel.createRegistrationCertificate();
    return NextResponse.json({ key: cert.key, token: cert.connection });
  }

  const cert = await UserLoginChannel.createConnectionCertificate();
  return NextResponse.json({ key: cert.key, token: cert.connection });
}
