import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";
import type { Agent, Realm, RealmSkill, User, Workflow } from "@prisma/client";

const IdParam = z.object({ id: z.string().min(1) });

export const realmsContract = c.router({
  list: {
    method: "GET",
    path: "/api/realms",
    summary: "List realms with counts of agents, users, and workflows",
    responses: {
      200: c.type<{
        realms: Array<
          Pick<Realm, "id" | "name" | "slug" | "description" | "color"> & {
            agentCount: number;
            userCount: number;
            workflowCount: number;
          }
        >;
      }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/realms",
    summary: "Create a new realm",
    body: z.object({
      name: z.string(),
      slug: z.string().optional(),
      description: z.string().optional(),
      color: z.string().optional(),
    }),
    responses: { 201: c.type<{ realm: Realm }>(), ...commonErrorResponses },
  },

  getOne: {
    method: "GET",
    path: "/api/realms/:id",
    pathParams: IdParam,
    summary: "Retrieve details of a specific realm",
    responses: {
      200: c.type<{
        realm: Realm;
        agents: Agent[];
        users: User[];
        workflows: Workflow[];
        tokenUsage: { promptTokens: number; completionTokens: number } | null;
      }>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/realms/:id",
    pathParams: IdParam,
    summary: "Update realm metadata or config",
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      color: z.string().optional(),
      llmConfig: z.record(z.string(), z.unknown()).nullable().optional(),
      defaultCapabilities: z.array(z.string()).optional(),
      tokenBudgetDaily: z.number().nullable().optional(),
      tokenBudgetMonthly: z.number().nullable().optional(),
      allowedCapabilities: z.array(z.string()).nullable().optional(),
    }),
    responses: { 200: c.type<Realm>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/realms/:id",
    pathParams: IdParam,
    summary: "Delete a realm (not allowed for default realm)",
    responses: { 200: z.object({ ok: z.boolean() }), ...commonErrorResponses },
  },

  addUser: {
    method: "POST",
    path: "/api/realms/:id/users",
    pathParams: IdParam,
    summary: "Add a user to a realm",
    body: z.object({
      userDid: z.string(),
      isPrimary: z.boolean().optional(),
      isRealmAdmin: z.boolean().optional(),
    }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  updateUser: {
    method: "PATCH",
    path: "/api/realms/:id/users",
    pathParams: IdParam,
    summary: "Update a user's realm admin status",
    body: z.object({ userDid: z.string(), isRealmAdmin: z.boolean() }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  removeUser: {
    method: "DELETE",
    path: "/api/realms/:id/users",
    pathParams: IdParam,
    summary: "Remove a user from the specified realm",
    body: z.object({ userDid: z.string() }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  socialMedia: {
    method: "POST",
    path: "/api/realms/:id/social-media",
    pathParams: IdParam,
    summary: "Dispatch a social media post intent to an online agent",
    body: z.object({ text: z.string().max(280) }),
    responses: {
      200: z.object({
        success: z.boolean(),
        intentId: z.string(),
        agentDid: z.string(),
        message: z.string(),
      }),
      ...commonErrorResponses,
    },
  },

  listSkills: {
    method: "GET",
    path: "/api/realms/:id/skills",
    pathParams: IdParam,
    summary: "List all skills defined for a realm",
    responses: {
      200: c.type<{ skills: RealmSkill[] }>(),
      ...commonErrorResponses,
    },
  },

  createSkill: {
    method: "POST",
    path: "/api/realms/:id/skills",
    pathParams: IdParam,
    summary: "Register a skill for a realm",
    body: z.object({
      name: z.string(),
      description: z.string().optional(),
      version: z.string().optional(),
      isRequired: z.boolean().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
    responses: { 201: c.type<{ skill: RealmSkill }>(), ...commonErrorResponses },
  },

  getSkill: {
    method: "GET",
    path: "/api/realms/:id/skills/:skillId",
    pathParams: z.object({ id: z.string(), skillId: z.string() }),
    summary: "Retrieve skill details by skill ID",
    responses: { 200: c.type<{ skill: RealmSkill }>(), ...commonErrorResponses },
  },

  updateSkill: {
    method: "PATCH",
    path: "/api/realms/:id/skills/:skillId",
    pathParams: z.object({ id: z.string(), skillId: z.string() }),
    summary: "Update skill metadata",
    body: z.object({
      description: z.string().nullable().optional(),
      version: z.string().nullable().optional(),
      isRequired: z.boolean().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
      content: z.string().nullable().optional(),
    }),
    responses: { 200: c.type<{ skill: RealmSkill }>(), ...commonErrorResponses },
  },

  deleteSkill: {
    method: "DELETE",
    path: "/api/realms/:id/skills/:skillId",
    pathParams: z.object({ id: z.string(), skillId: z.string() }),
    summary: "Remove a skill from the realm",
    responses: { 200: z.object({ ok: z.boolean() }), ...commonErrorResponses },
  },

  listModels: {
    method: "GET",
    path: "/api/realms/:id/models",
    pathParams: IdParam,
    summary: "List models available to a realm along with router key info",
    responses: {
      200: c.type<{
        models: Array<Record<string, unknown>>;
        routerKey: {
          hasVirtualKey: boolean;
          allowedModels: string[];
          monthlyBudgetUsd: number;
        } | null;
      }>(),
      ...commonErrorResponses,
    },
  },

  putLitellmKey: {
    method: "PUT",
    path: "/api/realms/:id/litellm-key",
    pathParams: IdParam,
    summary: "Provision or refresh the realm's LiteLLM router virtual key",
    body: z.object({ monthlyBudget: z.number().nullable().optional() }),
    responses: {
      200: z.object({
        ok: z.boolean(),
        keyPrefix: z.string(),
        allowedModels: z.array(z.string()),
        monthlyBudget: z.number().nullable(),
      }),
      ...commonErrorResponses,
    },
  },

  deleteLitellmKey: {
    method: "DELETE",
    path: "/api/realms/:id/litellm-key",
    pathParams: IdParam,
    summary: "Revoke the realm's LiteLLM router key",
    body: c.noBody(),
    responses: { 200: z.object({ ok: z.boolean() }), ...commonErrorResponses },
  },

  setDefault: {
    method: "POST",
    path: "/api/realms/:id/default",
    pathParams: IdParam,
    summary: "Set a realm as the default",
    body: c.noBody(),
    responses: { 200: z.object({ ok: z.boolean() }), ...commonErrorResponses },
  },

  listCredentials: {
    method: "GET",
    path: "/api/realms/:id/credentials",
    pathParams: IdParam,
    summary: "List credential metadata for a realm",
    query: z.object({ service: z.string().optional() }),
    responses: {
      200: c.type<{ credentials: Array<Record<string, unknown>> }>(),
      ...commonErrorResponses,
    },
  },

  saveCredential: {
    method: "POST",
    path: "/api/realms/:id/credentials",
    pathParams: IdParam,
    summary: "Save or update a credential for a realm",
    body: z.object({
      service: z.string(),
      name: z.string(),
      secret: z.string(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    responses: {
      201: z.object({ success: z.boolean(), id: z.string() }),
      ...commonErrorResponses,
    },
  },

  deleteCredential: {
    method: "DELETE",
    path: "/api/realms/:id/credentials",
    pathParams: IdParam,
    summary: "Remove a credential from a realm",
    query: z.object({ service: z.string(), name: z.string() }),
    responses: {
      200: z.object({ success: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  getCredential: {
    method: "GET",
    path: "/api/realms/:id/credentials/:credId",
    pathParams: z.object({ id: z.string(), credId: z.string() }),
    summary: "Retrieve the plaintext secret for a specific credential",
    responses: {
      200: z.object({
        id: z.string(),
        service: z.string(),
        name: z.string(),
        secret: z.string(),
      }),
      ...commonErrorResponses,
    },
  },

  addAgent: {
    method: "POST",
    path: "/api/realms/:id/agents",
    pathParams: IdParam,
    summary: "Add an agent to a realm",
    body: z.object({ agentDid: z.string(), isPrimary: z.boolean().optional() }),
    responses: {
      200: z.object({ ok: z.boolean(), llmPushed: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  removeAgent: {
    method: "DELETE",
    path: "/api/realms/:id/agents",
    pathParams: IdParam,
    summary: "Remove an agent from a realm",
    body: z.object({ agentDid: z.string() }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },
});
