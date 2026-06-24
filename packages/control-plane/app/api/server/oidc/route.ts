/**
 * GET    /api/server/oidc  — read OIDC config (secret redacted)
 * PUT    /api/server/oidc  — save OIDC config
 * POST   /api/server/oidc  — test OIDC connection (validate well-known)
 * DELETE /api/server/oidc  — remove OIDC config
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import {
  deleteOidcConfig,
  getOidcConfig,
  saveOidcConfig,
  testOidcConnection,
} from "@/lib/oidc-config";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { serverContract } from "@/lib/contracts";

const handlers = createNextRoute(serverContract, {
  // ── GET /api/server/oidc ──────────────────────────────────────────────────
  getOidc: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    // Config from env vars is read-only; flag it so the UI can reflect that.
    const fromEnv = !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID);
    const config = await getOidcConfig();
    if (!config)
      return { status: 200, body: { configured: false, fromEnv: false } };

    return {
      status: 200,
      body: {
        configured: true,
        fromEnv,
        issuer: config.issuer,
        clientId: config.clientId,
        clientSecret: "••••••••",
        providerName: config.providerName,
      },
    };
  },

  // ── PUT /api/server/oidc ──────────────────────────────────────────────────
  saveOidc: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (process.env.OIDC_ISSUER)
      throw new APIException(
        "MALFORMED",
        "OIDC is configured via environment variables and cannot be overridden from the UI"
      );

    if (!body.issuer?.trim())
      throw new APIException("MALFORMED", "Issuer URL is required");
    if (!body.clientId?.trim())
      throw new APIException("MALFORMED", "Client ID is required");

    // If keepSecret is set and no new secret was provided, reuse the existing one
    let clientSecret = body.clientSecret;
    if (body.keepSecret && !clientSecret) {
      const existing = await getOidcConfig();
      if (!existing?.clientSecret)
        throw new APIException("MALFORMED", "Client Secret is required");
      clientSecret = existing.clientSecret;
    }
    if (!clientSecret?.trim())
      throw new APIException("MALFORMED", "Client Secret is required");

    await saveOidcConfig({
      issuer: body.issuer.trim(),
      clientId: body.clientId.trim(),
      clientSecret: clientSecret.trim(),
      providerName: body.providerName?.trim() || "SSO",
    });

    return { status: 200, body: { ok: true } };
  },

  // ── POST /api/server/oidc ─────────────────────────────────────────────────
  testOidc: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (!body.issuer?.trim())
      throw new APIException("MALFORMED", "Issuer URL is required");

    const result = await testOidcConnection(body.issuer.trim());
    return { status: 200, body: result as Record<string, unknown> };
  },

  // ── DELETE /api/server/oidc ───────────────────────────────────────────────
  removeOidc: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (process.env.OIDC_ISSUER)
      throw new APIException(
        "MALFORMED",
        "Cannot remove OIDC config set via environment variables"
      );

    await deleteOidcConfig();
    return { status: 200, body: { ok: true } };
  },
});

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;
export const POST = handlers.POST!;
export const DELETE = handlers.DELETE!;
