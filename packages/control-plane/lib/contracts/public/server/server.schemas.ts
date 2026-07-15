import { z } from "zod";

// ── Responses
export const ServerSettingsResponseSchema = z.object({
  walletUrl: z.string(),
  peerjsHost: z.string(),
  devLogin: z.boolean(),
});

export const NotImplementedResponseSchema = z.object({ error: z.string() });
