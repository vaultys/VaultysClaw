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
