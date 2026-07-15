import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.agents, {
  setLocation: async ({ params, body }) => {
    const { did } = params;
    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    if (body.lat === null || body.lat === undefined) {
      await AgentDAO.updateLocation(did, null);
    } else {
      const lat = Number(body.lat);
      const lon = Number(body.lon);
      const label = String(body.label ?? "");
      if (Number.isNaN(lat) || Number.isNaN(lon))
        throw new APIException("MALFORMED", "Invalid latitude or longitude");
      await AgentDAO.updateLocation(did, { lat, lon, label });
    }

    return { status: 204, body: undefined };
  },
});

export const PATCH = handlers.PATCH!;
