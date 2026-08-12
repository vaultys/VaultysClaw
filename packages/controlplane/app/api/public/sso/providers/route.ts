import { NextResponse } from "next/server";
import { SsoConnectionDAO } from "@/db";
import { providerIdFor } from "@/lib/sso-config";

/**
 * The sign-in buttons the login page should offer.
 *
 * Public on purpose, and safe to be: it returns only what a login page has to
 * render anyway — a display name and the NextAuth provider id, which is already
 * visible in the URL the button navigates to. Issuer, client id and (obviously)
 * the client secret are not included; knowing *that* an org federates to some
 * IdP is unavoidable once a button says so, knowing *which tenant* is not.
 *
 * Disabled connections are omitted, so toggling one off in the admin UI removes
 * its button immediately.
 */
export async function GET() {
  const connections = await SsoConnectionDAO.listActive();
  return NextResponse.json({
    providers: connections.map((c) => ({
      id: providerIdFor(c),
      name: c.name,
      kind: c.kind,
    })),
  });
}
