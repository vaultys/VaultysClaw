import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { setStorageConfig } from "@/db/settings.dao";
import { settingsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * PATCH /api/settings/storage/location
 * Update or clear object-storage location shown on infrastructure maps.
 * Body: { lat: number, lon: number, label?: string } or { lat: null } to clear.
 */
const handlers = createNextRoute(settingsContract, {
  storageLocation: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (body.lat === null || body.lat === undefined) {
      await setStorageConfig({
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

    await setStorageConfig({
      locationLat: lat,
      locationLon: lon,
      locationLabel: body.label ?? "",
    });

    return { status: 200, body: { ok: true } };
  },
});

export const PATCH = handlers.PATCH!;
