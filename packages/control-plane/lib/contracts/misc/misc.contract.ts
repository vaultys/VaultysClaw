import { c } from "../contract";
import { commonErrorResponses } from "../common";
import {
  AboutQuerySchema,
  AboutResponseSchema,
  UserStatusResponseSchema,
} from "./misc.schemas";
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

export const aboutContract = c.router({
  get: {
    method: "GET",
    path: "/api/about",
    summary: "Retrieve documentation content",
    query: AboutQuerySchema,
    responses: {
      200: AboutResponseSchema,
      ...commonErrorResponses,
    },
  },
});

export const docsContract = c.router({
  swagger: {
    method: "GET",
    path: "/api/docs/swagger.json",
    summary: "OpenAPI 3.0 specification for the API (admin only)",
    responses: {
      200: c.type<Record<string, unknown>>(),
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
