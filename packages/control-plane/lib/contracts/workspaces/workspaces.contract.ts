import { z } from "zod";
import { c } from "../contract";
import { commonErrorResponses } from "../common";
import type { Workspace, WorkspaceSkill } from "@prisma/client";
import {
  AddWorkspaceAgentBodySchema,
  AddWorkspaceUserBodySchema,
  CreateWorkspaceBodySchema,
  CreateWorkspaceSkillBodySchema,
  DeleteCredentialQuerySchema,
  ListCredentialsQuerySchema,
  ListWorkspacesQuerySchema,
  PutWorkspaceLitellmKeyBodySchema,
  RemoveWorkspaceAgentBodySchema,
  RemoveWorkspaceUserBodySchema,
  SaveCredentialBodySchema,
  SocialMediaBodySchema,
  TransferWorkspaceOwnerBodySchema,
  UpdateWorkspaceBodySchema,
  UpdateWorkspaceSkillBodySchema,
  UpdateWorkspaceUserBodySchema,
} from "./workspaces.schemas";
import type {
  WorkspaceCredentialsResponse,
  WorkspaceDetail,
  WorkspaceModelsResponse,
  WorkspaceWithCounts,
  UserWorkspaceWithWorkspace,
} from "./workspaces.types";

const IdParam = z.object({ id: z.string().min(1) });

export const workspacesContract = c.router({
  list: {
    method: "GET",
    path: "/api/workspaces",
    summary: "List workspaces with counts of agents, users, and workflows",
    query: ListWorkspacesQuerySchema,
    responses: {
      200: c.type<{ workspaces: WorkspaceWithCounts[] }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/workspaces",
    summary: "Create a new workspace",
    body: CreateWorkspaceBodySchema,
    responses: { 201: c.type<{ workspace: Workspace }>(), ...commonErrorResponses },
  },

  listMyWorkspaces: {
    method: "GET",
    path: "/api/workspaces/me",
    summary: "List workspaces shared with the current user",
    responses: {
      200: c.type<{ userWorkspaces: UserWorkspaceWithWorkspace[] }>(),
      ...commonErrorResponses,
    },
  },

  getOne: {
    method: "GET",
    path: "/api/workspaces/:id",
    pathParams: IdParam,
    summary: "Retrieve details of a specific workspace",
    responses: {
      200: c.type<WorkspaceDetail>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/workspaces/:id",
    pathParams: IdParam,
    summary: "Update workspace metadata or config",
    body: UpdateWorkspaceBodySchema,
    responses: { 200: c.type<Workspace>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/workspaces/:id",
    pathParams: IdParam,
    summary: "Delete a workspace (not allowed for default workspace)",
    responses: { 200: z.object({ ok: z.boolean() }), ...commonErrorResponses },
  },

  addUser: {
    method: "POST",
    path: "/api/workspaces/:id/users",
    pathParams: IdParam,
    summary: "Add a user to a workspace",
    body: AddWorkspaceUserBodySchema,
    responses: {
      200: z.object({ ok: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  updateUser: {
    method: "PATCH",
    path: "/api/workspaces/:id/users",
    pathParams: IdParam,
    summary: "Update a user's workspace role (Admin/Member)",
    body: UpdateWorkspaceUserBodySchema,
    responses: {
      200: z.object({ ok: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  transferOwner: {
    method: "POST",
    path: "/api/workspaces/:id/owner",
    pathParams: IdParam,
    summary: "Transfer workspace ownership to another member",
    body: TransferWorkspaceOwnerBodySchema,
    responses: {
      200: z.object({ ok: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  removeUser: {
    method: "DELETE",
    path: "/api/workspaces/:id/users",
    pathParams: IdParam,
    summary: "Remove a user from the specified workspace",
    body: RemoveWorkspaceUserBodySchema,
    responses: {
      200: z.object({ ok: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  socialMedia: {
    method: "POST",
    path: "/api/workspaces/:id/social-media",
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
    path: "/api/workspaces/:id/skills",
    pathParams: IdParam,
    summary: "List all skills defined for a workspace",
    responses: {
      200: c.type<{ skills: WorkspaceSkill[] }>(),
      ...commonErrorResponses,
    },
  },

  createSkill: {
    method: "POST",
    path: "/api/workspaces/:id/skills",
    pathParams: IdParam,
    summary: "Register a skill for a workspace",
    body: CreateWorkspaceSkillBodySchema,
    responses: {
      201: c.type<{ skill: WorkspaceSkill }>(),
      ...commonErrorResponses,
    },
  },

  getSkill: {
    method: "GET",
    path: "/api/workspaces/:id/skills/:skillId",
    pathParams: z.object({ id: z.string(), skillId: z.string() }),
    summary: "Retrieve skill details by skill ID",
    responses: {
      200: c.type<{ skill: WorkspaceSkill }>(),
      ...commonErrorResponses,
    },
  },

  updateSkill: {
    method: "PATCH",
    path: "/api/workspaces/:id/skills/:skillId",
    pathParams: z.object({ id: z.string(), skillId: z.string() }),
    summary: "Update skill metadata",
    body: UpdateWorkspaceSkillBodySchema,
    responses: {
      200: c.type<{ skill: WorkspaceSkill }>(),
      ...commonErrorResponses,
    },
  },

  deleteSkill: {
    method: "DELETE",
    path: "/api/workspaces/:id/skills/:skillId",
    pathParams: z.object({ id: z.string(), skillId: z.string() }),
    summary: "Remove a skill from the workspace",
    responses: { 200: z.object({ ok: z.boolean() }), ...commonErrorResponses },
  },

  listModels: {
    method: "GET",
    path: "/api/workspaces/:id/models",
    pathParams: IdParam,
    summary: "List models available to a workspace along with router key info",
    responses: {
      200: c.type<WorkspaceModelsResponse>(),
      ...commonErrorResponses,
    },
  },

  putLitellmKey: {
    method: "PUT",
    path: "/api/workspaces/:id/litellm-key",
    pathParams: IdParam,
    summary: "Provision or refresh the workspace's LiteLLM router virtual key",
    body: PutWorkspaceLitellmKeyBodySchema,
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
    path: "/api/workspaces/:id/litellm-key",
    pathParams: IdParam,
    summary: "Revoke the workspace's LiteLLM router key",
    body: c.noBody(),
    responses: { 200: z.object({ ok: z.boolean() }), ...commonErrorResponses },
  },

  setDefault: {
    method: "POST",
    path: "/api/workspaces/:id/default",
    pathParams: IdParam,
    summary: "Set a workspace as the default",
    body: c.noBody(),
    responses: { 200: z.object({ ok: z.boolean() }), ...commonErrorResponses },
  },

  listCredentials: {
    method: "GET",
    path: "/api/workspaces/:id/credentials",
    pathParams: IdParam,
    summary: "List credential metadata for a workspace",
    query: ListCredentialsQuerySchema,
    responses: {
      200: c.type<WorkspaceCredentialsResponse>(),
      ...commonErrorResponses,
    },
  },

  saveCredential: {
    method: "POST",
    path: "/api/workspaces/:id/credentials",
    pathParams: IdParam,
    summary: "Save or update a credential for a workspace",
    body: SaveCredentialBodySchema,
    responses: {
      201: z.object({ success: z.boolean(), id: z.string() }),
      ...commonErrorResponses,
    },
  },

  deleteCredential: {
    method: "DELETE",
    path: "/api/workspaces/:id/credentials",
    pathParams: IdParam,
    summary: "Remove a credential from a workspace",
    query: DeleteCredentialQuerySchema,
    responses: {
      200: z.object({ success: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  getCredential: {
    method: "GET",
    path: "/api/workspaces/:id/credentials/:credId",
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
    path: "/api/workspaces/:id/agents",
    pathParams: IdParam,
    summary: "Add an agent to a workspace",
    body: AddWorkspaceAgentBodySchema,
    responses: {
      200: z.object({ ok: z.boolean(), llmPushed: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  removeAgent: {
    method: "DELETE",
    path: "/api/workspaces/:id/agents",
    pathParams: IdParam,
    summary: "Remove an agent from a workspace",
    body: RemoveWorkspaceAgentBodySchema,
    responses: {
      200: z.object({ ok: z.boolean() }),
      ...commonErrorResponses,
    },
  },
});
