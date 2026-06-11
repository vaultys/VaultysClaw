import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";

export const intentsContract = c.router({
  send: {
    method: "POST",
    path: "/api/intents",
    summary: "Send an intent to one or more agents",
    body: z.object({
      agentId: z.string().optional(),
      action: z.string().optional(),
      params: z.record(z.string(), z.unknown()).optional(),
      broadcastCapability: z.string().optional(),
    }),
    responses: {
      202: z.object({
        intentId: z.string(),
        action: z.string(),
        sentTo: z.array(z.string()),
        count: z.number(),
      }),
      ...commonErrorResponses,
    },
  },

  list: {
    method: "GET",
    path: "/api/intents",
    summary: "List recent intents with their execution results",
    responses: {
      200: c.type<{
        intents: Array<{
          intentId: string;
          agentDid: string;
          action: string;
          params: Record<string, unknown>;
          status: string;
          output: Record<string, unknown> | null;
          error: string | null;
          sentAt: string;
          completedAt: string | null;
        }>;
      }>(),
      ...commonErrorResponses,
    },
  },
});
