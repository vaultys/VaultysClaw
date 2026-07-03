import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  MapQuerySchema,
  NetworkControlBodySchema,
} from "./network.schemas";
import { MapResponse, NetworkControlResponse } from "./network.types";

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

export const mapContract = c.router({
  get: {
    method: "GET",
    path: "/api/admin/map",
    summary: "Aggregate all located entities into map markers",
    query: MapQuerySchema,
    responses: {
      200: c.type<MapResponse>(),
      ...commonErrorResponses,
    },
  },
});
