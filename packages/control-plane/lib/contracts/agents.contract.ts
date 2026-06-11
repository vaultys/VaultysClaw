import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";

// ────────────────────────────────────────────────────────────
// Shared schemas
// ────────────────────────────────────────────────────────────

/** Minimal LLM descriptor surfaced in agent detail responses. */
export const LlmDescriptorSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

/** Live token counters reported by a connected agent. */
export const TokenUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

/**
 * Detailed view of a single agent, combining persisted data (DB) with live
 * connection state (WebSocket server). All timestamps are ISO-8601 strings —
 * the handler is responsible for serializing `Date` values before returning.
 */
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

export type AgentDetail = z.infer<typeof AgentDetailSchema>;

/** Body accepted by PATCH /api/agents/:did (global admin only). */
export const UpdateAgentBodySchema = z.object({
  capabilities: z.array(z.string()).optional(),
  tokenBudgetDaily: z.number().nullable().optional(),
  tokenBudgetMonthly: z.number().nullable().optional(),
});

export type UpdateAgentBody = z.infer<typeof UpdateAgentBodySchema>;

/** Response of a successful capability/budget update. */
export const UpdateAgentResponseSchema = z.object({
  capabilities: z.array(z.string()).nullable(),
});

const DidParams = z.object({
  did: z.string().min(1, "did is required"),
});

// ────────────────────────────────────────────────────────────
// Contract
// ────────────────────────────────────────────────────────────

export const agentDetailContract = c.router({
  getAgent: {
    method: "GET",
    path: "/api/agents/:did",
    pathParams: DidParams,
    summary: "Get detailed info for a single agent by DID",
    responses: {
      200: AgentDetailSchema,
      ...commonErrorResponses,
    },
  },

  updateAgent: {
    method: "PATCH",
    path: "/api/agents/:did",
    pathParams: DidParams,
    summary: "Update an agent's capabilities and token budgets (admin only)",
    body: UpdateAgentBodySchema,
    responses: {
      200: UpdateAgentResponseSchema,
      ...commonErrorResponses,
    },
  },

  deleteAgent: {
    method: "DELETE",
    path: "/api/agents/:did",
    pathParams: DidParams,
    summary: "Delete an agent (admin only)",
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      ...commonErrorResponses,
    },
  },
});
