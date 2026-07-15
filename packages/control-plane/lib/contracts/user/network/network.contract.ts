import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import { NetworkLogQuerySchema } from "./network.schemas";
import { NetworkResponse } from "./network.types";

/**
 * User-facing read of live transport stats and server state. Any authenticated
 * user can read; runtime control (POST) is admin-only — see
 * adminContract.network (networkControlContract).
 */
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
});
