import { z } from "zod";

// ── Path params
export const BridgeIncomingParamsSchema = z.object({ bridgeId: z.string() });

// ── Bodies (declared for documentation; the handlers read the raw body to
// verify signatures, so the contract uses an opaque body type).
export const WebhookIncomingBodySchema = z.object({
  message: z.string().optional(),
  author: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export const TeamsIncomingBodySchema = z.record(z.string(), z.unknown());

// ── Responses
export const BridgeIncomingResponseSchema = z.object({
  ok: z.boolean(),
  messageId: z.string(),
});
