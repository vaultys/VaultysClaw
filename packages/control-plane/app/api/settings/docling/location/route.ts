import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { getDoclingConfig, setDoclingConfig } from "@/db/settings.dao";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * PATCH /api/settings/docling/location
 * Update or clear Docling service location shown on infrastructure maps.
 * Body: { lat: number, lon: number, label?: string } or { lat: null } to clear.
 */
const handlers = createNextRoute(adminContract.settings, {
  doclingLocation: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const cfg = await getDoclingConfig();
    if (!cfg) throw new APIException("NOT_FOUND", "Docling configuration not found");

    if (body.lat === null || body.lat === undefined) {
      await setDoclingConfig({
        url: cfg.url,
        enabled: cfg.enabled,
        sourceEndpoint: cfg.sourceEndpoint,
        fileEndpoint: cfg.fileEndpoint,
        locationLat: null,
        locationLon: null,
        locationLabel: null,
      });
      return { status: 200, body: { ok: true } };
    }

    const lat = Number(body.lat);
    const lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new APIException("MALFORMED", "lat and lon must be valid numbers");
    }

    await setDoclingConfig({
      url: cfg.url,
      enabled: cfg.enabled,
      sourceEndpoint: cfg.sourceEndpoint,
      fileEndpoint: cfg.fileEndpoint,
      locationLat: lat,
      locationLon: lon,
      locationLabel: body.label ?? "",
    });

    return { status: 200, body: { ok: true } };
  },
});

export const PATCH = handlers.PATCH!;
