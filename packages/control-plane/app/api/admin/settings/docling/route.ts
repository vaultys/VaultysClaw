import { APIException } from "@/lib/api/utils/api-utils";
import { getDoclingConfig, setDoclingConfig } from "@/db/settings.dao";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.settings, {
  // ── GET /api/admin/settings/docling ─────────────────────────────────────────────
  getDocling: async () => {

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

  // ── PUT /api/admin/settings/docling ─────────────────────────────────────────────
  updateDocling: async ({ body }) => {

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
