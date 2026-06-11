import { z } from "zod";

// ─────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────

export const LlmDescriptorSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

export const TokenUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

// ─────────────────────────────────────────────
// Agent
// ─────────────────────────────────────────────

export const AgentDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  capabilities: z.array(z.string()),
  publicKey: z.string().nullable(),
  certificateInfo: z.record(z.string(), z.unknown()).nullable(),
  agentVaultysId: z.record(z.string(), z.unknown()).nullable(),
  registeredAt: z.string(),
  lastSeen: z.string(),
  online: z.boolean(),
  connectedAt: z.string().nullable(),
  lastHeartbeat: z.string().nullable(),
  reportedLlm: LlmDescriptorSchema.nullable(),
  storedLlm: LlmDescriptorSchema.nullable(),
  transport: z.enum(["ws", "peerjs"]).nullable(),
  tokenUsage: TokenUsageSchema.nullable(),
  tokenBudgetDaily: z.number().nullable(),
  tokenBudgetMonthly: z.number().nullable(),
  todayTokens: z.number(),
  monthTokens: z.number(),
  locationLat: z.number().nullable(),
  locationLon: z.number().nullable(),
  locationLabel: z.string().nullable(),
});

export const AgentSummarySchema = z.object({
  id: z.string(),
  did: z.string(),
  name: z.string(),
  capabilities: z.array(z.string()),
  online: z.boolean().optional(),
});

export const RealmSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  color: z.string(),
  isPrimary: z.boolean(),
});

/** Full item shape returned by GET /api/agents (list endpoint). */
export const AgentListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  capabilities: z.array(z.string()),
  registeredAt: z.string(),
  lastSeen: z.string(),
  online: z.boolean(),
  connectedAt: z.string().nullable(),
  lastHeartbeat: z.string().nullable(),
  reportedLlm: LlmDescriptorSchema.nullable(),
  tokenUsage: TokenUsageSchema.nullable(),
  transport: z.enum(["ws", "peerjs"]).nullable(),
  locationLat: z.number().nullable(),
  locationLon: z.number().nullable(),
  locationLabel: z.string().nullable(),
  realms: z.array(RealmSummarySchema),
});

// ─────────────────────────────────────────────
// Params
// ─────────────────────────────────────────────

export const DidParamsSchema = z.object({
  did: z.string().min(1),
});

export const DidSkillParamsSchema = z.object({
  did: z.string(),
  skillId: z.string(),
});

export const DidPeerParamsSchema = z.object({
  did: z.string(),
  grantId: z.string(),
});

export const DidScheduleParamsSchema = z.object({
  did: z.string(),
  id: z.string(),
});

export const DidSessionParamsSchema = z.object({
  did: z.string(),
  sessionId: z.string(),
});

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export const ListAgentsQuerySchema = z.object({
  q: z.string().optional(),
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

// ─────────────────────────────────────────────
// Responses
// ─────────────────────────────────────────────

export const UpdateAgentResponseSchema = z.object({
  capabilities: z.array(z.string()).nullable(),
});

export const SendTaskResponseSchema = z.object({
  agentId: z.string(),
  action: z.string(),
});

export const CreateScheduleResponseSchema = z.object({
  agentId: z.string(),
  scheduleId: z.string(),
});

export const LitellmKeyStatusSchema = z.object({
  configured: z.boolean(),
  keyPrefix: z.string().nullable(),
  allowedModels: z.array(z.string()),
  dailyBudget: z.number().nullable(),
  updatedAt: z.string().nullable(),
  litellmConfigured: z.boolean(),
});

export const SafeLlmConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  baseUrl: z.string().optional(),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().optional(),
  apiKeySet: z.boolean(),
});