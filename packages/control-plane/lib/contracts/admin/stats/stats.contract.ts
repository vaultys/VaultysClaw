import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import { StatsTokensResponse } from "./stats.types";

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
