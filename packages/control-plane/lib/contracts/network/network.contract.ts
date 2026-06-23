import { c } from "../contract";
import { commonErrorResponses } from "../common";
import {
  NetworkControlBodySchema,
  NetworkLogQuerySchema,
} from "./network.schemas";
import { NetworkControlResponse, NetworkResponse } from "./network.types";

export const networkContract = c.router({
  get: {
    method: "GET",
    path: "/api/network",
    summary: "Retrieve live transport stats and server state",
    query: NetworkLogQuerySchema,
    responses: {
      200: c.type<NetworkResponse>(),
      ...commonErrorResponses,
    },
  },

  control: {
    method: "POST",
    path: "/api/network",
    summary: "Control WS and PeerJS servers at runtime",
    body: NetworkControlBodySchema,
    responses: {
      200: c.type<NetworkControlResponse>(),
      ...commonErrorResponses,
    },
  },
});
