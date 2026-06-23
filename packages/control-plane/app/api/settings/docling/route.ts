import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { getDoclingConfig, setDoclingConfig } from "@/db/settings.dao";
import { settingsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(settingsContract, {
  // ── GET /api/settings/docling ─────────────────────────────────────────────
  getDocling: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const cfg = await getDoclingConfig();
    return {
      status: 200,
      body: {
        url: cfg?.url ?? "",
        enabled: cfg?.enabled ?? false,
        configured: !!cfg?.url,
        sourceEndpoint: cfg?.sourceEndpoint ?? null,
        fileEndpoint: cfg?.fileEndpoint ?? null,
        locationLat: cfg?.locationLat,
        locationLon: cfg?.locationLon,
        locationLabel: cfg?.locationLabel,
      },
    };
  },

  // ── PUT /api/settings/docling ─────────────────────────────────────────────
  updateDocling: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const url = (body.url ?? "").trim().replace(/\/$/, "");
    const enabled = body.enabled ?? false;

    if (enabled && !url) {
      throw new APIException(
        "MALFORMED",
        "URL is required when enabling Docling"
      );
    }

    await setDoclingConfig({ url, enabled });
    return { status: 200, body: { ok: true } };
  },
});

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;
