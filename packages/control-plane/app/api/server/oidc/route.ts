/**
 * GET    /api/server/oidc  — read OIDC config (secret redacted)
 * PUT    /api/server/oidc  — save OIDC config
 * POST   /api/server/oidc  — test OIDC connection (validate well-known)
 * DELETE /api/server/oidc  — remove OIDC config
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { forbidden, malformed, unauthorized } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";
import {
  deleteOidcConfig,
  getOidcConfig,
  saveOidcConfig,
  testOidcConnection,
} from "@/lib/oidc-config";

export const GET = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  // If config comes from env vars, indicate that so the UI can show it as read-only
  const fromEnv = !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID);
  const config = await getOidcConfig();

  if (!config) {
    return NextResponse.json({ configured: false, fromEnv: false });
  }

  return NextResponse.json({
    configured: true,
    fromEnv,
    issuer: config.issuer,
    clientId: config.clientId,
    clientSecret: "••••••••",
    providerName: config.providerName,
  });
});

export const PUT = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  if (process.env.OIDC_ISSUER) {
    return malformed("OIDC is configured via environment variables and cannot be overridden from the UI");
  }

  const body = (await request.json()) as {
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    providerName?: string;
    keepSecret?: boolean;
  };

  if (!body.issuer?.trim()) return malformed("Issuer URL is required");
  if (!body.clientId?.trim()) return malformed("Client ID is required");

  // If keepSecret is true and no new secret was provided, load the existing one
  if (body.keepSecret && !body.clientSecret) {
    const existing = await getOidcConfig();
    if (!existing?.clientSecret) return malformed("Client Secret is required");
    body.clientSecret = existing.clientSecret;
  }

  if (!body.clientSecret?.trim()) return malformed("Client Secret is required");

  await saveOidcConfig({
    issuer: body.issuer.trim(),
    clientId: body.clientId.trim(),
    clientSecret: body.clientSecret.trim(),
    providerName: body.providerName?.trim() || "SSO",
  });

  return NextResponse.json({ ok: true });
});

export const POST = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await request.json()) as { issuer?: string };
  if (!body.issuer?.trim()) return malformed("Issuer URL is required");

  const result = await testOidcConnection(body.issuer.trim());
  return NextResponse.json(result);
});

export const DELETE = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  if (process.env.OIDC_ISSUER) {
    return malformed("Cannot remove OIDC config set via environment variables");
  }

  await deleteOidcConfig();
  return NextResponse.json({ ok: true });
});
