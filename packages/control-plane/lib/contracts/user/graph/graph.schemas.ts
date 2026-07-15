import { z } from "zod";

// ── Queries
export const GraphQuerySchema = z.object({
  agent: z.string().optional(),
  user: z.string().optional(),
  workspace: z.string().optional(),
});
