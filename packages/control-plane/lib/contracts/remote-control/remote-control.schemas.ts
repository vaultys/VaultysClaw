import { z } from "zod";

// ── Bodies

/**
 * Update body for the Telegram remote-control connector. Every field is
 * optional so callers can patch one setting at a time. `botToken` of "" clears
 * the stored token; omit it to leave the existing token untouched.
 */
export const UpdateTelegramBodySchema = z.object({
  enabled: z.boolean().optional(),
  botToken: z.string().optional(),
  allowedChatIds: z.array(z.string()).optional(),
  defaultAgentDid: z.string().nullable().optional(),
  agentByChat: z.record(z.string(), z.string()).optional(),
});

/** Test an arbitrary token (or the stored one when omitted). */
export const TestTelegramBodySchema = z.object({
  botToken: z.string().optional(),
});
