import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";
import type { Agent } from "@prisma/client";
import type { ChatHistoryMessage, ChatSession, SkillConfig } from "@vaultysclaw/shared";
import type { RealmLlmData, SafeLlmConfig, TokenUsageHistory } from "@/types";

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

const DidParams = z.object({ did: z.string().min(1, "did is required") });

// ────────────────────────────────────────────────────────────
// /api/agents/:did — detail / mutate / delete (implemented route)
// ────────────────────────────────────────────────────────────

export const agentDetailContract = c.router({
  getAgent: {
    method: "GET",
    path: "/api/agents/:did",
    pathParams: DidParams,
    summary: "Get detailed info for a single agent by DID",
    responses: { 200: AgentDetailSchema, ...commonErrorResponses },
  },

  updateAgent: {
    method: "PATCH",
    path: "/api/agents/:did",
    pathParams: DidParams,
    summary: "Update an agent's capabilities and token budgets (admin only)",
    body: UpdateAgentBodySchema,
    responses: { 200: UpdateAgentResponseSchema, ...commonErrorResponses },
  },

  deleteAgent: {
    method: "DELETE",
    path: "/api/agents/:did",
    pathParams: DidParams,
    summary: "Delete an agent (admin only)",
    body: c.noBody(),
    responses: { 204: c.noBody(), ...commonErrorResponses },
  },
});

// ────────────────────────────────────────────────────────────
// /api/agents (collection) + sub-resources
// ────────────────────────────────────────────────────────────

const AgentSummarySchema = z.object({
  id: z.string(),
  did: z.string(),
  name: z.string(),
  capabilities: z.array(z.string()),
  online: z.boolean().optional(),
});

export const agentsContract = c.router({
  list: {
    method: "GET",
    path: "/api/agents",
    summary: "List agents with optional pagination and filters",
    query: z.object({
      q: z.string().optional(),
      online: z.enum(["true", "false"]).optional(),
      realm: z.string().optional(),
      capabilities: z.string().optional(),
      page: z.coerce.number().optional(),
      pageSize: z.coerce.number().optional(),
      sortBy: z.enum(["name", "lastSeen", "registeredAt"]).optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
    }),
    responses: {
      200: c.type<{
        agents: Agent[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        online: number;
      }>(),
      ...commonErrorResponses,
    },
  },

  search: {
    method: "GET",
    path: "/api/agents/search",
    summary: "Search for agents by name or DID",
    query: z.object({ q: z.string().optional(), realm: z.string().optional() }),
    responses: {
      200: z.object({ agents: z.array(AgentSummarySchema) }),
      ...commonErrorResponses,
    },
  },

  tokenUsage: {
    method: "GET",
    path: "/api/agents/:did/token-usage",
    pathParams: DidParams,
    summary: "Retrieve token usage history for an agent",
    query: z.object({
      granularity: z.enum(["day", "month"]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
    responses: { 200: c.type<TokenUsageHistory>(), ...commonErrorResponses },
  },

  sendTask: {
    method: "POST",
    path: "/api/agents/:did/task",
    pathParams: DidParams,
    summary: "Enqueue a task on an agent via WebSocket",
    body: z.object({
      action: z.string(),
      params: z.record(z.string(), z.unknown()).optional(),
    }),
    responses: {
      200: z.object({ agentId: z.string(), action: z.string() }),
      ...commonErrorResponses,
    },
  },

  getSkills: {
    method: "GET",
    path: "/api/agents/:did/skills",
    pathParams: DidParams,
    summary: "Get effective skill configuration for an agent",
    responses: {
      200: c.type<{ skills: SkillConfig[] }>(),
      ...commonErrorResponses,
    },
  },

  updateSkillOverride: {
    method: "PATCH",
    path: "/api/agents/:did/skills",
    pathParams: DidParams,
    summary: "Update an agent's skill override (by realm skill id)",
    body: z.object({ realmSkillId: z.string(), enabled: z.boolean() }),
    responses: {
      200: c.type<{ skills: SkillConfig[] }>(),
      ...commonErrorResponses,
    },
  },

  updateSkill: {
    method: "PATCH",
    path: "/api/agents/:did/skill/:skillId",
    pathParams: z.object({ did: z.string(), skillId: z.string() }),
    summary: "Toggle a single skill for an agent",
    body: z.object({ enabled: z.boolean() }),
    responses: {
      200: c.type<{ skills: SkillConfig[] }>(),
      ...commonErrorResponses,
    },
  },

  createSchedule: {
    method: "POST",
    path: "/api/agents/:did/schedules",
    pathParams: DidParams,
    summary: "Upsert a schedule on an agent",
    body: z.object({
      id: z.string(),
      name: z.string(),
      cron: z.string(),
      action: z.string(),
      params: z.record(z.string(), z.unknown()).optional(),
      enabled: z.boolean().optional(),
    }),
    responses: {
      200: z.object({ agentId: z.string(), scheduleId: z.string() }),
      ...commonErrorResponses,
    },
  },

  deleteSchedule: {
    method: "DELETE",
    path: "/api/agents/:did/schedules/:id",
    pathParams: z.object({ did: z.string(), id: z.string() }),
    summary: "Delete a schedule on an agent",
    responses: {
      200: z.object({ agentId: z.string(), scheduleId: z.string() }),
      ...commonErrorResponses,
    },
  },

  getRealmLlm: {
    method: "GET",
    path: "/api/agents/:did/realm-llm",
    pathParams: DidParams,
    summary: "Get the agent's realm LiteLLM routing options",
    responses: { 200: c.type<RealmLlmData>(), ...commonErrorResponses },
  },

  listPeers: {
    method: "GET",
    path: "/api/agents/:did/peers",
    pathParams: DidParams,
    summary: "List agent peer grants",
    responses: {
      200: c.type<{ grants: unknown[] }>(),
      ...commonErrorResponses,
    },
  },

  createPeer: {
    method: "POST",
    path: "/api/agents/:did/peers",
    pathParams: DidParams,
    summary: "Create a peer grant for an agent",
    body: z.object({
      peerDid: z.string(),
      capabilities: z.array(z.string()),
      expiresAt: z.string().optional(),
    }),
    responses: { 201: c.type<unknown>(), ...commonErrorResponses },
  },

  getPeer: {
    method: "GET",
    path: "/api/agents/:did/peers/:grantId",
    pathParams: z.object({ did: z.string(), grantId: z.string() }),
    summary: "Get peer grant details",
    responses: { 200: c.type<unknown>(), ...commonErrorResponses },
  },

  deletePeer: {
    method: "DELETE",
    path: "/api/agents/:did/peers/:grantId",
    pathParams: z.object({ did: z.string(), grantId: z.string() }),
    summary: "Revoke a peer grant",
    body: c.noBody(),
    responses: { 204: c.noBody(), ...commonErrorResponses },
  },

  setLocation: {
    method: "PATCH",
    path: "/api/agents/:did/location",
    pathParams: DidParams,
    summary: "Set or clear the geographic location of an agent",
    body: z.object({
      lat: z.number().nullable().optional(),
      lon: z.number().optional(),
      label: z.string().optional(),
    }),
    responses: { 204: c.noBody(), ...commonErrorResponses },
  },

  getLlmConfig: {
    method: "GET",
    path: "/api/agents/:did/llm-config",
    pathParams: DidParams,
    summary: "Retrieve stored LLM config with masked API key",
    responses: {
      200: c.type<{ config: SafeLlmConfig | null }>(),
      ...commonErrorResponses,
    },
  },

  setLlmConfig: {
    method: "PUT",
    path: "/api/agents/:did/llm-config",
    pathParams: DidParams,
    summary: "Set the agent's LLM config",
    body: z.record(z.string(), z.unknown()),
    responses: {
      200: c.type<{ pushed: boolean; config: SafeLlmConfig }>(),
      ...commonErrorResponses,
    },
  },

  deleteLlmConfig: {
    method: "DELETE",
    path: "/api/agents/:did/llm-config",
    pathParams: DidParams,
    summary: "Clear LLM config for the agent",
    body: c.noBody(),
    responses: {
      200: z.object({ pushed: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  getLitellmKey: {
    method: "GET",
    path: "/api/agents/:did/litellm-key",
    pathParams: DidParams,
    summary: "Retrieve the per-agent LiteLLM key status",
    responses: {
      200: z.object({
        configured: z.boolean(),
        keyPrefix: z.string().nullable(),
        allowedModels: z.array(z.string()),
        dailyBudget: z.number().nullable(),
        updatedAt: z.string().nullable(),
        litellmConfigured: z.boolean(),
      }),
      ...commonErrorResponses,
    },
  },

  putLitellmKey: {
    method: "PUT",
    path: "/api/agents/:did/litellm-key",
    pathParams: DidParams,
    summary: "Provision or refresh the per-agent LiteLLM virtual key",
    body: z.object({
      allowedModels: z.array(z.string()).optional(),
      dailyBudget: z.number().nullable().optional(),
    }),
    responses: {
      200: z.object({
        ok: z.boolean(),
        keyPrefix: z.string(),
        allowedModels: z.array(z.string()),
        dailyBudget: z.number().nullable(),
      }),
      ...commonErrorResponses,
    },
  },

  deleteLitellmKey: {
    method: "DELETE",
    path: "/api/agents/:did/litellm-key",
    pathParams: DidParams,
    summary: "Revoke the per-agent LiteLLM key",
    body: c.noBody(),
    responses: { 200: z.object({ ok: z.boolean() }), ...commonErrorResponses },
  },

  getChatSessions: {
    method: "GET",
    path: "/api/agents/:did/chat-sessions",
    pathParams: DidParams,
    summary: "Retrieve chat sessions",
    responses: {
      200: c.type<{ sessions: ChatSession[] }>(),
      ...commonErrorResponses,
    },
  },

  getSessionMessages: {
    method: "GET",
    path: "/api/agents/:did/chat-sessions/:sessionId",
    pathParams: z.object({ did: z.string(), sessionId: z.string() }),
    summary: "Retrieve full history for a session",
    responses: {
      200: c.type<{ messages: ChatHistoryMessage[] }>(),
      ...commonErrorResponses,
    },
  },
});
