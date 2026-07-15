import { z } from "zod";

// ── Queries
export const ListIntentsQuerySchema = z.object({
  limit: z.coerce.number().optional(),
  agentDid: z.string().optional(),
});

// ── Bodies
export const SendIntentBodySchema = z.object({
  agentId: z.string().optional(),
  action: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  broadcastCapability: z.string().optional(),
});

// ── Responses
export const SendIntentResponseSchema = z.object({
  intentId: z.string(),
  action: z.string(),
  sentTo: z.array(z.string()),
  count: z.number(),
});
