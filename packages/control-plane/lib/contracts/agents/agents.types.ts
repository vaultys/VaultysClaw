import { z } from "zod";
import {
    AgentDetailSchema,
    AgentSummarySchema,
    ListAgentsQuerySchema,
    TokenUsageQuerySchema,
    SearchAgentsQuerySchema,
    UpdateAgentBodySchema,
    UpdateAgentResponseSchema,
    SendTaskBodySchema,
    SendTaskResponseSchema,
    CreateScheduleBodySchema,
    CreateScheduleResponseSchema,
} from "./agents.schemas";
import { commonPaginatedResponseSchema } from "../common";
import { AgentModelWithRealms } from "@/db/types";

// ─────────────────────────────────────────────
// Agent
// ─────────────────────────────────────────────

export type AgentDetail = z.infer<typeof AgentDetailSchema>;
export type AgentSummary = z.infer<typeof AgentSummarySchema>;

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
export type CreateScheduleResponse = z.infer<typeof CreateScheduleResponseSchema>
export const agentPaginatedResponseSchema = commonPaginatedResponseSchema(AgentModelWithRealms);