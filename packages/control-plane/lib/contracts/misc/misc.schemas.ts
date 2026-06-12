import { z } from "zod";

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export const AboutQuerySchema = z.object({
  doc: z.string().optional(),
});

// ─────────────────────────────────────────────
// Responses
// ─────────────────────────────────────────────

export const AboutResponseSchema = z.object({
  content: z.string(),
});

export const UserStatusResponseSchema = z.object({
  hasUsers: z.boolean(),
  serverDid: z.string().nullable(),
});
