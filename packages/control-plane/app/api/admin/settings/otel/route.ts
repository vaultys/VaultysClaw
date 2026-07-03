import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { SettingsDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.settings, {
  // ── PUT /api/admin/settings/otel — save OTel config (admin) ───────────────
  saveOtel: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    await SettingsDAO.set("otel_enabled", body.enabled ? "true" : "false");
    if (body.baseUrl) await SettingsDAO.set("otel_base_url", body.baseUrl);
    if (body.serviceName)
      await SettingsDAO.set("otel_service_name", body.serviceName);

    return { status: 200, body: { ok: true } };
  },

  // ── POST /api/admin/settings/otel — test connectivity (admin) ─────────────
  testOtel: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const testUrl = body.baseUrl;
    if (!testUrl) throw new APIException("MALFORMED", "baseUrl is required");

    const startTime = Date.now();
    try {
      const response = await fetch(`${testUrl}/v1/traces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceSpans: [] }),
        signal: AbortSignal.timeout(5000),
      });
      return {
        status: 200,
        body: {
          connected: response.ok,
          latency: Date.now() - startTime,
          statusCode: response.status,
        },
      };
    } catch (testError) {
      return {
        status: 200,
        body: {
          connected: false,
          error:
            testError instanceof Error
              ? testError.message
              : "Connection failed",
        },
      };
    }
  },
});

export const PUT = handlers.PUT!;
export const POST = handlers.POST!;
