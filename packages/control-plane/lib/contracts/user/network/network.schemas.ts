import { z } from "zod";

// ── Queries
export const NetworkLogQuerySchema = z.object({
  logLimit: z.coerce.number().int().min(1).max(500).optional(),
});
