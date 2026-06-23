import { z } from "zod";
import { c } from "../contract";
import { commonErrorResponses } from "../common";
import type { Realm, RealmSkill } from "@prisma/client";
import {
  AddRealmAgentBodySchema,
  AddRealmUserBodySchema,
  CreateRealmBodySchema,
  CreateRealmSkillBodySchema,
  DeleteCredentialQuerySchema,
  ListCredentialsQuerySchema,
  PutRealmLitellmKeyBodySchema,
  RemoveRealmAgentBodySchema,
  RemoveRealmUserBodySchema,
  SaveCredentialBodySchema,
  SocialMediaBodySchema,
  UpdateRealmBodySchema,
  UpdateRealmSkillBodySchema,
  UpdateRealmUserBodySchema,
} from "./realms.schemas";
import type {
  RealmCredentialsResponse,
  RealmDetail,
  RealmModelsResponse,
  RealmWithCounts,
} from "./realms.types";

const IdParam = z.object({ id: z.string().min(1) });

export const realmsContract = c.router({
  list: {
    method: "GET",
    path: "/api/realms",
    summary: "List realms with counts of agents, users, and workflows",
    responses: {
      200: c.type<{ realms: RealmWithCounts[] }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/realms",
    summary: "Create a new realm",
    body: CreateRealmBodySchema,
    responses: { 201: c.type<{ realm: Realm }>(), ...commonErrorResponses },
  },

  getOne: {
    method: "GET",
    path: "/api/realms/:id",
    pathParams: IdParam,
    summary: "Retrieve details of a specific realm",
    responses: {
      200: c.type<RealmDetail>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/realms/:id",
    pathParams: IdParam,
    summary: "Update realm metadata or config",
    body: UpdateRealmBodySchema,
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
    body: AddRealmUserBodySchema,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  updateUser: {
    method: "PATCH",
    path: "/api/realms/:id/users",
    pathParams: IdParam,
    summary: "Update a user's realm admin status",
    body: UpdateRealmUserBodySchema,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  removeUser: {
    method: "DELETE",
    path: "/api/realms/:id/users",
    pathParams: IdParam,
    summary: "Remove a user from the specified realm",
    body: RemoveRealmUserBodySchema,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  socialMedia: {
    method: "POST",
    path: "/api/realms/:id/social-media",
    pathParams: IdParam,
    summary: "Dispatch a social media post intent to an online agent",
    body: SocialMediaBodySchema,
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
    body: CreateRealmSkillBodySchema,
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
    body: UpdateRealmSkillBodySchema,
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
      200: c.type<RealmModelsResponse>(),
      ...commonErrorResponses,
    },
  },

  putLitellmKey: {
    method: "PUT",
    path: "/api/realms/:id/litellm-key",
    pathParams: IdParam,
    summary: "Provision or refresh the realm's LiteLLM router virtual key",
    body: PutRealmLitellmKeyBodySchema,
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
    query: ListCredentialsQuerySchema,
    responses: {
      200: c.type<RealmCredentialsResponse>(),
      ...commonErrorResponses,
    },
  },

  saveCredential: {
    method: "POST",
    path: "/api/realms/:id/credentials",
    pathParams: IdParam,
    summary: "Save or update a credential for a realm",
    body: SaveCredentialBodySchema,
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
    query: DeleteCredentialQuerySchema,
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
    body: AddRealmAgentBodySchema,
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
    body: RemoveRealmAgentBodySchema,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },
});
