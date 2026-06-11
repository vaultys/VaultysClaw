import { z } from "zod";
import { commonPaginatedResponseSchema, commonErrorResponses } from "./../common";
import { c } from "../contract";

import {
  AgentDetailSchema,
  AgentListItemSchema,
  AgentSummarySchema,
  CreatePeerBodySchema,
  CreateScheduleBodySchema,
  CreateScheduleResponseSchema,
  DidParamsSchema,
  DidPeerParamsSchema,
  DidScheduleParamsSchema,
  DidSessionParamsSchema,
  DidSkillParamsSchema,
  LitellmKeyStatusSchema,
  ListAgentsQuerySchema,
  PutLiteLlmKeyBodySchema,
  SafeLlmConfigSchema,
  SearchAgentsQuerySchema,
  SendTaskBodySchema,
  SendTaskResponseSchema,
  SetLocationBodySchema,
  SetLlmConfigBodySchema,
  TokenUsageQuerySchema,
  UpdateAgentBodySchema,
  UpdateAgentResponseSchema,
  UpdateSkillBodySchema,
  UpdateSkillOverrideBodySchema,
} from "./agents.schemas";
import type { AgentSummary } from "./agents.types";

export const agentsContract = c.router({
  // ─── Agent CRUD ─────────────────────────────────────────────────────────────

  getAgent: {
    method: "GET",
    path: "/api/agents/:did",
    pathParams: DidParamsSchema,
    responses: {
      200: AgentDetailSchema,
      ...commonErrorResponses,
    },
  },

  updateAgent: {
    method: "PATCH",
    path: "/api/agents/:did",
    pathParams: DidParamsSchema,
    body: UpdateAgentBodySchema,
    responses: {
      200: UpdateAgentResponseSchema,
      ...commonErrorResponses,
    },
  },

  deleteAgent: {
    method: "DELETE",
    path: "/api/agents/:did",
    pathParams: DidParamsSchema,
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      ...commonErrorResponses,
    },
  },

  // ─── List / Search ───────────────────────────────────────────────────────────

  list: {
    method: "GET",
    path: "/api/agents",
    query: ListAgentsQuerySchema,
    responses: {
      200: commonPaginatedResponseSchema(AgentListItemSchema).extend({ online: z.number() }),
      ...commonErrorResponses,
    },
  },

  search: {
    method: "GET",
    path: "/api/agents/search",
    query: SearchAgentsQuerySchema,
    responses: {
      200: c.type<{ agents: AgentSummary[] }>(),
      ...commonErrorResponses,
    },
  },

  // ─── Task / Schedule ─────────────────────────────────────────────────────────

  sendTask: {
    method: "POST",
    path: "/api/agents/:did/task",
    pathParams: DidParamsSchema,
    body: SendTaskBodySchema,
    responses: {
      200: SendTaskResponseSchema,
      ...commonErrorResponses,
    },
  },

  createSchedule: {
    method: "POST",
    path: "/api/agents/:did/schedules",
    pathParams: DidParamsSchema,
    body: CreateScheduleBodySchema,
    responses: {
      200: CreateScheduleResponseSchema,
      ...commonErrorResponses,
    },
  },

  deleteSchedule: {
    method: "DELETE",
    path: "/api/agents/:did/schedules/:id",
    pathParams: DidScheduleParamsSchema,
    body: c.noBody(),
    responses: {
      200: c.type<{ agentId: string; scheduleId: string }>(),
      ...commonErrorResponses,
    },
  },

  // ─── Token usage ─────────────────────────────────────────────────────────────

  tokenUsage: {
    method: "GET",
    path: "/api/agents/:did/token-usage",
    pathParams: DidParamsSchema,
    query: TokenUsageQuerySchema,
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  // ─── Skills ──────────────────────────────────────────────────────────────────

  getSkills: {
    method: "GET",
    path: "/api/agents/:did/skills",
    pathParams: DidParamsSchema,
    responses: {
      200: c.type<{ skills: any[] }>(),
      ...commonErrorResponses,
    },
  },

  updateSkillOverride: {
    method: "PATCH",
    path: "/api/agents/:did/skills",
    pathParams: DidParamsSchema,
    body: UpdateSkillOverrideBodySchema,
    responses: {
      200: c.type<{ skills: any[] }>(),
      ...commonErrorResponses,
    },
  },

  updateSkill: {
    method: "PATCH",
    path: "/api/agents/:did/skill/:skillId",
    pathParams: DidSkillParamsSchema,
    body: UpdateSkillBodySchema,
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  // ─── Peers ───────────────────────────────────────────────────────────────────

  listPeers: {
    method: "GET",
    path: "/api/agents/:did/peers",
    pathParams: DidParamsSchema,
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  createPeer: {
    method: "POST",
    path: "/api/agents/:did/peers",
    pathParams: DidParamsSchema,
    body: CreatePeerBodySchema,
    responses: {
      201: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  getPeer: {
    method: "GET",
    path: "/api/agents/:did/peers/:grantId",
    pathParams: DidPeerParamsSchema,
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  deletePeer: {
    method: "DELETE",
    path: "/api/agents/:did/peers/:grantId",
    pathParams: DidPeerParamsSchema,
    body: c.noBody(),
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  // ─── Location ────────────────────────────────────────────────────────────────

  setLocation: {
    method: "PATCH",
    path: "/api/agents/:did/location",
    pathParams: DidParamsSchema,
    body: SetLocationBodySchema,
    responses: {
      204: c.noBody(),
      ...commonErrorResponses,
    },
  },

  // ─── LLM config ──────────────────────────────────────────────────────────────

  getLlmConfig: {
    method: "GET",
    path: "/api/agents/:did/llm-config",
    pathParams: DidParamsSchema,
    responses: {
      200: c.type<{ config: any | null }>(),
      ...commonErrorResponses,
    },
  },

  setLlmConfig: {
    method: "PUT",
    path: "/api/agents/:did/llm-config",
    pathParams: DidParamsSchema,
    body: SetLlmConfigBodySchema,
    responses: {
      200: c.type<{ pushed: boolean; config: any }>(),
      ...commonErrorResponses,
    },
  },

  deleteLlmConfig: {
    method: "DELETE",
    path: "/api/agents/:did/llm-config",
    pathParams: DidParamsSchema,
    body: c.noBody(),
    responses: {
      200: c.type<{ pushed: boolean }>(),
      ...commonErrorResponses,
    },
  },

  // ─── LiteLLM key ─────────────────────────────────────────────────────────────

  getLitellmKey: {
    method: "GET",
    path: "/api/agents/:did/litellm-key",
    pathParams: DidParamsSchema,
    responses: {
      200: LitellmKeyStatusSchema,
      ...commonErrorResponses,
    },
  },

  putLitellmKey: {
    method: "PUT",
    path: "/api/agents/:did/litellm-key",
    pathParams: DidParamsSchema,
    body: PutLiteLlmKeyBodySchema,
    responses: {
      200: c.type<{ ok: boolean; keyPrefix: string; allowedModels: string[]; dailyBudget: number | null }>(),
      ...commonErrorResponses,
    },
  },

  deleteLitellmKey: {
    method: "DELETE",
    path: "/api/agents/:did/litellm-key",
    pathParams: DidParamsSchema,
    body: c.noBody(),
    responses: {
      200: c.type<{ ok: boolean }>(),
      ...commonErrorResponses,
    },
  },

  // ─── Realm LLM ───────────────────────────────────────────────────────────────

  getRealmLlm: {
    method: "GET",
    path: "/api/agents/:did/realm-llm",
    pathParams: DidParamsSchema,
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  // ─── Chat sessions ───────────────────────────────────────────────────────────

  getChatSessions: {
    method: "GET",
    path: "/api/agents/:did/chat-sessions",
    pathParams: DidParamsSchema,
    responses: {
      200: c.type<{ sessions: any[] }>(),
      ...commonErrorResponses,
    },
  },

  getSessionMessages: {
    method: "GET",
    path: "/api/agents/:did/chat-sessions/:sessionId",
    pathParams: DidSessionParamsSchema,
    responses: {
      200: c.type<{ messages: any[] }>(),
      ...commonErrorResponses,
    },
  },
});
