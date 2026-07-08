import { SettingsDAO } from "@/db";
import { userContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(userContract.settings, {
  // ── GET /api/settings/otel — read OTel status (any authenticated user) ────
  getOtel: async ({ request }) => {

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
        baseUrl: dbBaseUrl || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "",
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
});

export const GET = handlers.GET!;
