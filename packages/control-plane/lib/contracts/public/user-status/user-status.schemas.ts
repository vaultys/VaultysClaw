import { z } from "zod";

// ─────────────────────────────────────────────
// Responses
// ─────────────────────────────────────────────

export const UserStatusResponseSchema = z.object({
  hasUsers: z.boolean(),
  serverDid: z.string().nullable(),
});
