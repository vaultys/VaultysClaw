import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";

export const statsContract = c.router({
  tokens: {
    method: "GET",
    path: "/api/stats/tokens",
    summary: "Retrieve token usage statistics",
    responses: {
      200: c.type<{
        allTime: Record<string, unknown>;
        daily: Record<string, unknown>;
        monthly: Record<string, unknown>;
      }>(),
      ...commonErrorResponses,
    },
  },
});

export const aboutContract = c.router({
  get: {
    method: "GET",
    path: "/api/about",
    summary: "Retrieve documentation content",
    query: z.object({ doc: z.string().optional() }),
    responses: { 200: z.object({ content: z.string() }), ...commonErrorResponses },
  },
});

export const userStatusContract = c.router({
  status: {
    method: "GET",
    path: "/api/user/status",
    summary: "Retrieve the user status and server DID",
    responses: {
      200: z.object({
        hasUsers: z.boolean(),
        serverDid: z.string().nullable(),
      }),
      ...commonErrorResponses,
    },
  },
});
