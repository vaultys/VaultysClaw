import { z } from "zod";

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export const ListAgentsQuerySchema = z.object({
  search: z.string().optional(),
  online: z.enum(["true", "false"]).optional(),
  realm: z.string().optional(),
  capabilities: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  sortBy: z.enum(["name", "lastSeen", "registeredAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export const TokenUsageQuerySchema = z.object({
  granularity: z.enum(["day", "month"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const SearchAgentsQuerySchema = z.object({
  q: z.string().optional(),
  realm: z.string().optional(),
});

// ─────────────────────────────────────────────
// Bodies
// ─────────────────────────────────────────────

export const UpdateAgentBodySchema = z.object({
  capabilities: z.array(z.string()).optional(),
  tokenBudgetDaily: z.number().nullable().optional(),
  tokenBudgetMonthly: z.number().nullable().optional(),
});

export const SendTaskBodySchema = z.object({
  action: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const CreateScheduleBodySchema = z.object({
  id: z.string(),
  name: z.string(),
  cron: z.string(),
  action: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export const UpdateSkillBodySchema = z.object({
  enabled: z.boolean(),
});

export const UpdateSkillOverrideBodySchema = z.object({
  realmSkillId: z.string(),
  enabled: z.boolean(),
});

export const CreatePeerBodySchema = z.object({
  peerDid: z.string(),
  capabilities: z.array(z.string()),
  expiresAt: z.string().optional(),
});

export const SetLocationBodySchema = z.object({
  lat: z.number().nullable().optional(),
  lon: z.number().optional(),
  label: z.string().optional(),
});

export const SetLlmConfigBodySchema = z.record(z.string(), z.unknown());

export const PutLiteLlmKeyBodySchema = z.object({
  allowedModels: z.array(z.string()).optional(),
  dailyBudget: z.number().nullable().optional(),
});

export const RunIntentBodySchema = z.object({
  action: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
  timeoutMs: z.number().min(1000).max(120_000).optional(),
});
