import { commonErrorResponses, PaginatedResponse } from "./../common";
import { c } from "../contract";

import {
  CreatePeerBodySchema,
  CreateScheduleBodySchema,
  ListAgentsQuerySchema,
  PutLiteLlmKeyBodySchema,
  SearchAgentsQuerySchema,
  SendTaskBodySchema,
  SetLocationBodySchema,
  SetLlmConfigBodySchema,
  TokenUsageQuerySchema,
  UpdateAgentBodySchema,
  UpdateSkillBodySchema,
  UpdateSkillOverrideBodySchema,
} from "./agents.schemas";
import z from "zod";
import { AgentInfo } from "./agents.types";

export const agentsContract = c.router({
  // ─── Agent CRUD ─────────────────────────────────────────────────────────────

  getAgent: {
    method: "GET",
    path: "/api/agents/:did",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<any>(), // TODO: c.type<AgentDetail>(),
      ...commonErrorResponses,
    },
  },

  updateAgent: {
    method: "PATCH",
    path: "/api/agents/:did",
    pathParams: z.object({ did: z.string() }),
    body: UpdateAgentBodySchema,
    responses: {
      200: c.type<any>(), // TODO: c.type<UpdateAgentResponse>(),
      ...commonErrorResponses,
    },
  },

  deleteAgent: {
    method: "DELETE",
    path: "/api/agents/:did",
    pathParams: z.object({ did: z.string() }),
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
      200: c.type<PaginatedResponse<AgentInfo>>(),
      ...commonErrorResponses,
    },
  },

  search: {
    method: "GET",
    path: "/api/agents/search",
    query: SearchAgentsQuerySchema,
    responses: {
      200: c.type<{ agents: AgentInfo[] }>(),
      ...commonErrorResponses,
    },
  },

  // ─── Task / Schedule ─────────────────────────────────────────────────────────

  sendTask: {
    method: "POST",
    path: "/api/agents/:did/task",
    pathParams: z.object({ did: z.string() }),
    body: SendTaskBodySchema,
    responses: {
      200: c.type<any>(), // TODO: c.type<SendTaskResponse>(),
      ...commonErrorResponses,
    },
  },

  createSchedule: {
    method: "POST",
    path: "/api/agents/:did/schedules",
    pathParams: z.object({ did: z.string() }),
    body: CreateScheduleBodySchema,
    responses: {
      200: c.type<any>(), // TODO: c.type<CreateScheduleResponse>(),
      ...commonErrorResponses,
    },
  },

  deleteSchedule: {
    method: "DELETE",
    path: "/api/agents/:did/schedules/:id",
    pathParams: z.object({ did: z.string(), id: z.string() }),
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
    pathParams: z.object({ did: z.string() }),
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
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<{ skills: any[] }>(),
      ...commonErrorResponses,
    },
  },

  updateSkillOverride: {
    method: "PATCH",
    path: "/api/agents/:did/skills",
    pathParams: z.object({ did: z.string() }),
    body: UpdateSkillOverrideBodySchema,
    responses: {
      200: c.type<{ skills: any[] }>(),
      ...commonErrorResponses,
    },
  },

  updateSkill: {
    method: "PATCH",
    path: "/api/agents/:did/skill/:skillId",
    pathParams: z.object({ did: z.string(), skillId: z.string() }),
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
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  createPeer: {
    method: "POST",
    path: "/api/agents/:did/peers",
    pathParams: z.object({ did: z.string() }),
    body: CreatePeerBodySchema,
    responses: {
      201: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  getPeer: {
    method: "GET",
    path: "/api/agents/:did/peers/:grantId",
    pathParams: z.object({ did: z.string(), grantId: z.string() }),
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  deletePeer: {
    method: "DELETE",
    path: "/api/agents/:did/peers/:grantId",
    pathParams: z.object({ did: z.string(), grantId: z.string() }),
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
    pathParams: z.object({ did: z.string() }),
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
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<{ config: any | null }>(),
      ...commonErrorResponses,
    },
  },

  setLlmConfig: {
    method: "PUT",
    path: "/api/agents/:did/llm-config",
    pathParams: z.object({ did: z.string() }),
    body: SetLlmConfigBodySchema,
    responses: {
      200: c.type<{ pushed: boolean; config: any }>(),
      ...commonErrorResponses,
    },
  },

  deleteLlmConfig: {
    method: "DELETE",
    path: "/api/agents/:did/llm-config",
    pathParams: z.object({ did: z.string() }),
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
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<any>(), // TODO: c.type<LitellmKeyStatus>(),
      ...commonErrorResponses,
    },
  },

  putLitellmKey: {
    method: "PUT",
    path: "/api/agents/:did/litellm-key",
    pathParams: z.object({ did: z.string() }),
    body: PutLiteLlmKeyBodySchema,
    responses: {
      200: c.type<{
        ok: boolean;
        keyPrefix: string;
        allowedModels: string[];
        dailyBudget: number | null;
      }>(),
      ...commonErrorResponses,
    },
  },

  deleteLitellmKey: {
    method: "DELETE",
    path: "/api/agents/:did/litellm-key",
    pathParams: z.object({ did: z.string() }),
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
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  // ─── Chat sessions ───────────────────────────────────────────────────────────

  getChatSessions: {
    method: "GET",
    path: "/api/agents/:did/chat-sessions",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<{ sessions: any[] }>(),
      ...commonErrorResponses,
    },
  },

  getSessionMessages: {
    method: "GET",
    path: "/api/agents/:did/chat-sessions/:sessionId",
    pathParams: z.object({ did: z.string(), sessionId: z.string() }),
    responses: {
      200: c.type<{ messages: any[] }>(),
      ...commonErrorResponses,
    },
  },
});
