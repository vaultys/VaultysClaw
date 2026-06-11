import { z } from "zod";
import {
  AgentDetailSchema,
  AgentListItemSchema,
  AgentSummarySchema,
  CreateScheduleBodySchema,
  CreateScheduleResponseSchema,
  ListAgentsQuerySchema,
  LitellmKeyStatusSchema,
  RealmSummarySchema,
  SafeLlmConfigSchema,
  SearchAgentsQuerySchema,
  SendTaskBodySchema,
  SendTaskResponseSchema,
  TokenUsageQuerySchema,
  UpdateAgentBodySchema,
  UpdateAgentResponseSchema,
} from "./agents.schemas";

// ─────────────────────────────────────────────
// Agent shapes
// ─────────────────────────────────────────────

export type AgentDetail = z.infer<typeof AgentDetailSchema>;
export type AgentSummary = z.infer<typeof AgentSummarySchema>;
export type AgentListItem = z.infer<typeof AgentListItemSchema>;
export type RealmSummary = z.infer<typeof RealmSummarySchema>;

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export type ListAgentsQuery = z.infer<typeof ListAgentsQuerySchema>;
export type TokenUsageQuery = z.infer<typeof TokenUsageQuerySchema>;
export type SearchAgentsQuery = z.infer<typeof SearchAgentsQuerySchema>;

// ─────────────────────────────────────────────
// Bodies
// ─────────────────────────────────────────────

export type UpdateAgentBody = z.infer<typeof UpdateAgentBodySchema>;
export type SendTaskBody = z.infer<typeof SendTaskBodySchema>;
export type CreateScheduleBody = z.infer<typeof CreateScheduleBodySchema>;

// ─────────────────────────────────────────────
// Responses
// ─────────────────────────────────────────────

export type UpdateAgentResponse = z.infer<typeof UpdateAgentResponseSchema>;
export type SendTaskResponse = z.infer<typeof SendTaskResponseSchema>;
export type CreateScheduleResponse = z.infer<typeof CreateScheduleResponseSchema>;
export type LitellmKeyStatus = z.infer<typeof LitellmKeyStatusSchema>;
export type SafeLlmConfig = z.infer<typeof SafeLlmConfigSchema>;