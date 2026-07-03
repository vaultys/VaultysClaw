import { z } from "zod";

// ── Queries
export const AuditQuerySchema = z.object({
  limit: z.coerce.number().optional(),
  source: z.enum(["activity", "intent", ""]).optional(),
  status: z.enum(["success", "failed", "pending"]).optional(),
  agentDid: z.string().optional(),
});

// ── Path params
export const AuditEntryParamsSchema = z.object({ id: z.string() });
