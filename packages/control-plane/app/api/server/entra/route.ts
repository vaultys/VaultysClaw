/**
 * GET  /api/server/entra  — read Entra config (secret redacted)
 * PUT  /api/server/entra  — save Entra config
 * POST /api/server/entra  — test connectivity (list groups)
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import {
  getEntraConfig,
  saveEntraConfig,
  listEntraGroups,
  diagnoseEntraConfig,
} from "@/lib/entra-sync";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { serverContract } from "@/lib/contracts";

const handlers = createNextRoute(serverContract, {
  // ── GET /api/server/entra ─────────────────────────────────────────────────
  getEntra: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const config = await getEntraConfig();
    if (!config) return { status: 200, body: { configured: false } };

    return {
      status: 200,
      body: {
        configured: true,
        tenantId: config.tenantId,
        clientId: config.clientId,
        clientSecret: "••••••••",
      },
    };
  },

  // ── PUT /api/server/entra ─────────────────────────────────────────────────
  saveEntra: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    // If secret is the redacted placeholder, keep the existing one
    const existing = await getEntraConfig();
    const secret =
      body.clientSecret === "••••••••" && existing
        ? existing.clientSecret
        : body.clientSecret;

    await saveEntraConfig({
      tenantId: body.tenantId,
      clientId: body.clientId,
      clientSecret: secret,
    });
    return { status: 200, body: { ok: true } };
  },

  // ── POST /api/server/entra ────────────────────────────────────────────────
  testEntra: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    // Accept an inline (unsaved) config so the UI can test before saving
    const saved = await getEntraConfig();
    const config = {
      tenantId: body.tenantId ?? saved?.tenantId ?? "",
      clientId: body.clientId ?? saved?.clientId ?? "",
      clientSecret:
        body.clientSecret && body.clientSecret !== "••••••••"
          ? body.clientSecret
          : (saved?.clientSecret ?? ""),
    };

    if (!config.tenantId || !config.clientId || !config.clientSecret)
      throw new APIException(
        "MALFORMED",
        "tenantId, clientId and clientSecret are required for connectivity test"
      );

    const checks = await diagnoseEntraConfig(config);
    const allOk = checks.every((c) => c.status === "ok");
    if (!allOk) return { status: 200, body: { ok: false, checks } };

    // All checks passed — also return the group list for the wizard
    try {
      const groups = await listEntraGroups();
      return { status: 200, body: { ok: true, checks, groups } };
    } catch (err) {
      return {
        status: 200,
        body: {
          ok: false,
          checks,
          error: err instanceof Error ? err.message : "Failed to list groups",
        },
      };
    }
  },
});

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;
export const POST = handlers.POST!;
