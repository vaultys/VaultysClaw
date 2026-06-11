import { commonPaginatedResponseSchema } from './../common';
import { c } from "../contract";
import { commonErrorResponses } from "../common";

import {
  AgentDetailSchema, DidParamsSchema,
  DidSkillParamsSchema,
  DidScheduleParamsSchema,
  ListAgentsQuerySchema,
  SearchAgentsQuerySchema,
  TokenUsageQuerySchema,
  UpdateAgentBodySchema,
  UpdateAgentResponseSchema,
  SendTaskBodySchema,
  SendTaskResponseSchema,
  CreateScheduleBodySchema,
  CreateScheduleResponseSchema,
  UpdateSkillBodySchema,
  UpdateSkillOverrideBodySchema,
  CreatePeerBodySchema,
  SetLocationBodySchema,
  SetLlmConfigBodySchema,
  PutLiteLlmKeyBodySchema,
  AgentSummarySchema,
} from "./agents.schemas";
import { AgentSummary } from "./agents.types";

export const agentsContract = c.router({
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

  list: {
    method: "GET",
    path: "/api/agents",
    query: ListAgentsQuerySchema,
    responses: {
      200: commonPaginatedResponseSchema(AgentSummarySchema),
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
    responses: {
      200: c.type<{ agentId: string; scheduleId: string }>(),
      ...commonErrorResponses,
    },
  },

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

  updateSkillOverride: {
    method: "PATCH",
    path: "/api/agents/:did/skills",
    pathParams: DidParamsSchema,
    body: UpdateSkillOverrideBodySchema,
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

  setLlmConfig: {
    method: "PUT",
    path: "/api/agents/:did/llm-config",
    pathParams: DidParamsSchema,
    body: SetLlmConfigBodySchema,
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  putLiteLlmKey: {
    method: "PUT",
    path: "/api/agents/:did/litellm-key",
    pathParams: DidParamsSchema,
    body: PutLiteLlmKeyBodySchema,
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },
});