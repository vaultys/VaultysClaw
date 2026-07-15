import { z } from "zod";

// ── Responses
export const HealthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
});
