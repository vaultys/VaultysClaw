import { c } from "../contract";
import { commonErrorResponses } from "../common";
import { UserStatusResponseSchema } from "./misc.schemas";
import { StatsTokensResponse } from "./misc.types";

export const statsContract = c.router({
  tokens: {
    method: "GET",
    path: "/api/stats/tokens",
    summary: "Retrieve token usage statistics",
    responses: {
      200: c.type<StatsTokensResponse>(),
      ...commonErrorResponses,
    },
  },
});

export const userStatusContract = c.router({
  status: {
    method: "GET",
    path: "/api/user/status",
    summary: "Retrieve the user status and server DID",
    responses: {
      200: UserStatusResponseSchema,
      ...commonErrorResponses,
    },
  },
});
