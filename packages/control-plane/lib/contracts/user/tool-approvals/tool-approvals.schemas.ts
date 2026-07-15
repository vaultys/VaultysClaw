import { z } from "zod";

// ── Bodies
export const ToolApprovalRespondBodySchema = z.object({
  requestId: z.string(),
  approved: z.boolean(),
  reason: z.string().optional(),
});
