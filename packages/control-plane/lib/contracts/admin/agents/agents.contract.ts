import { commonErrorResponses, PaginatedResponse } from "../../common";
import { c } from "../../contract";

import {
  CreatePeerBodySchema,
  CreateScheduleBodySchema,
  ListAgentsQuerySchema,
  PutLiteLlmKeyBodySchema,
  RunIntentBodySchema,
  SetLlmConfigBodySchema,
  TokenUsageQuerySchema,
  UpdateAgentBodySchema,
  UpdateSkillBodySchema,
  UpdateSkillOverrideBodySchema,
} from "./agents.schemas";
import z from "zod";
import { AgentInfo } from "./agents.types";

export const adminAgentsContract = c.router({
  // ─── Agent CRUD ─────────────────────────────────────────────────────────────

  getAgent: {
    method: "GET",
    path: "/api/admin/agents/:did",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<AgentInfo>(),
      ...commonErrorResponses,
    },
  },

  updateAgent: {
    method: "PATCH",
    path: "/api/admin/agents/:did",
    pathParams: z.object({ did: z.string() }),
    body: UpdateAgentBodySchema,
    responses: {
      200: c.type<any>(), // TODO: c.type<UpdateAgentResponse>(),
      ...commonErrorResponses,
    },
  },

  deleteAgent: {
    method: "DELETE",
    path: "/api/admin/agents/:did",
    pathParams: z.object({ did: z.string() }),
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      ...commonErrorResponses,
    },
  },

  // ─── List / Search ───────────────────────────────────────────────────────────

  search: {
    method: "GET",
    path: "/api/admin/agents",
    query: ListAgentsQuerySchema,
    responses: {
      200: c.type<PaginatedResponse<AgentInfo>>(),
      ...commonErrorResponses,
    },
  },

  // ─── Task / Schedule ─────────────────────────────────────────────────────────

  runIntent: {
    method: "POST",
    path: "/api/admin/agents/:did/run",
    pathParams: z.object({ did: z.string() }),
    body: RunIntentBodySchema,
    responses: {
      200: c.type<{
        intentId: string;
        status: "success" | "failed";
        output: unknown;
        error: string | null;
        executedAt: string;
      }>(),
      ...commonErrorResponses,
    },
  },

  createSchedule: {
    method: "POST",
    path: "/api/admin/agents/:did/schedules",
    pathParams: z.object({ did: z.string() }),
    body: CreateScheduleBodySchema,
    responses: {
      200: c.type<any>(), // TODO: c.type<CreateScheduleResponse>(),
      ...commonErrorResponses,
    },
  },

  deleteSchedule: {
    method: "DELETE",
    path: "/api/admin/agents/:did/schedules/:id",
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
    path: "/api/admin/agents/:did/token-usage",
    pathParams: z.object({ did: z.string() }),
    query: TokenUsageQuerySchema,
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  // ─── Skills ──────────────────────────────────────────────────────────────────
  // getSkills (GET) moved to the user agents contract (/api/agents/:did/skills).
  // Overriding a skill stays admin-only.

  updateSkillOverride: {
    method: "PATCH",
    path: "/api/admin/agents/:did/skills",
    pathParams: z.object({ did: z.string() }),
    body: UpdateSkillOverrideBodySchema,
    responses: {
      200: c.type<{ skills: any[] }>(),
      ...commonErrorResponses,
    },
  },

  updateSkill: {
    method: "PATCH",
    path: "/api/admin/agents/:did/skill/:skillId",
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
    path: "/api/admin/agents/:did/peers",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  createPeer: {
    method: "POST",
    path: "/api/admin/agents/:did/peers",
    pathParams: z.object({ did: z.string() }),
    body: CreatePeerBodySchema,
    responses: {
      201: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  getPeer: {
    method: "GET",
    path: "/api/admin/agents/:did/peers/:grantId",
    pathParams: z.object({ did: z.string(), grantId: z.string() }),
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  deletePeer: {
    method: "DELETE",
    path: "/api/admin/agents/:did/peers/:grantId",
    pathParams: z.object({ did: z.string(), grantId: z.string() }),
    body: c.noBody(),
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

  // ─── LLM config ──────────────────────────────────────────────────────────────

  getLlmConfig: {
    method: "GET",
    path: "/api/admin/agents/:did/llm-config",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<{ config: any | null }>(),
      ...commonErrorResponses,
    },
  },

  setLlmConfig: {
    method: "PUT",
    path: "/api/admin/agents/:did/llm-config",
    pathParams: z.object({ did: z.string() }),
    body: SetLlmConfigBodySchema,
    responses: {
      200: c.type<{ pushed: boolean; config: any }>(),
      ...commonErrorResponses,
    },
  },

  deleteLlmConfig: {
    method: "DELETE",
    path: "/api/admin/agents/:did/llm-config",
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
    path: "/api/admin/agents/:did/litellm-key",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<any>(), // TODO: c.type<LitellmKeyStatus>(),
      ...commonErrorResponses,
    },
  },

  putLitellmKey: {
    method: "PUT",
    path: "/api/admin/agents/:did/litellm-key",
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
    path: "/api/admin/agents/:did/litellm-key",
    pathParams: z.object({ did: z.string() }),
    body: c.noBody(),
    responses: {
      200: c.type<{ ok: boolean }>(),
      ...commonErrorResponses,
    },
  },

  // ─── Workspace LLM ───────────────────────────────────────────────────────────────

  getWorkspaceLlm: {
    method: "GET",
    path: "/api/admin/agents/:did/workspace-llm",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<any>(),
      ...commonErrorResponses,
    },
  },

});
