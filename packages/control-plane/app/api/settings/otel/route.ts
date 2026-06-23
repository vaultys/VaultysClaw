import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { SettingsDAO } from "@/db";
import { settingsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(settingsContract, {
  // ── GET /api/settings/otel ────────────────────────────────────────────────
  getOtel: async ({ request }) => {
    await getAuthContext(request);

    const settings = await SettingsDAO.getMany([
      "otel_enabled",
      "otel_base_url",
      "otel_service_name",
    ]);

    const dbEnabled = settings["otel_enabled"];
    const dbBaseUrl = settings["otel_base_url"];
    const dbServiceName = settings["otel_service_name"];

    return {
      status: 200,
      body: {
        // DB value wins; fall back to env vars
        enabled:
          dbEnabled !== undefined
            ? dbEnabled === "true"
            : process.env.OTEL_ENABLED === "true",
        baseUrl:
          dbBaseUrl || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "",
        serviceName:
          dbServiceName ||
          process.env.OTEL_SERVICE_NAME ||
          "vaultysclaw-control-plane",
        connected: false,
        // Let the UI know these values came from env so it can show a hint
        fromEnv: {
          enabled:
            dbEnabled === undefined && process.env.OTEL_ENABLED !== undefined,
          baseUrl: !dbBaseUrl && !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
          serviceName: !dbServiceName && !!process.env.OTEL_SERVICE_NAME,
        },
      },
    };
  },

  // ── PUT /api/settings/otel ────────────────────────────────────────────────
  saveOtel: async ({ body, request }) => {
    await getAuthContext(request);

    await SettingsDAO.set("otel_enabled", body.enabled ? "true" : "false");
    if (body.baseUrl) await SettingsDAO.set("otel_base_url", body.baseUrl);
    if (body.serviceName)
      await SettingsDAO.set("otel_service_name", body.serviceName);

    return { status: 200, body: { ok: true } };
  },

  // ── POST /api/settings/otel — test connectivity ───────────────────────────
  testOtel: async ({ body, request }) => {
    await getAuthContext(request);

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

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;
export const POST = handlers.POST!;
