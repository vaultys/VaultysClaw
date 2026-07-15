import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import { NetworkControlBodySchema } from "./network.schemas";
import { NetworkControlResponse } from "./network.types";

/**
 * Admin-only runtime control of the WebSocket and PeerJS servers. The read
 * counterpart (GET /api/network) is user-facing — see userContract.network.
 */
export const networkControlContract = c.router({
  control: {
    method: "POST",
    path: "/api/admin/network",
    summary: "Control WS and PeerJS servers at runtime",
    body: NetworkControlBodySchema,
    responses: {
      200: c.type<NetworkControlResponse>(),
      ...commonErrorResponses,
    },
  },
});
