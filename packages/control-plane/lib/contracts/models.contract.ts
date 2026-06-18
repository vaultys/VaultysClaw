import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";
import type { ModelRegistry, Prisma } from "@prisma/client";

const IdParam = z.object({ id: z.string().min(1) });

/**
 * A model registry entry with its realm-access rows joined in — everything the
 * models list UI needs in a single query (the `apiKeyEnc` secret is excluded by
 * the `select`). Mirrors the `AgentWithInfo` pattern; the matching query lives
 * in `ModelDAO.findAll`. Consumers derive the realm count from `realmAccess.length`.
 */
export type ModelWithRealmAccess = Prisma.ModelRegistryGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    provider: true;
    modelId: true;
    baseUrl: true;
    litellmModelName: true;
    status: true;
    metadata: true;
    createdBy: true;
    createdAt: true;
    updatedAt: true;
    realmAccess: true;
  };
}>;

/** Response of `POST /api/models` — the created entry (sans secret) + LiteLLM status. */
export type CreatedModel = Omit<ModelRegistry, "apiKeyEnc"> & {
  litellmRegistered: boolean;
};

export const modelsContract = c.router({
  list: {
    method: "GET",
    path: "/api/models",
    summary: "List all model registry entries",
    responses: {
      200: c.type<{ models: ModelWithRealmAccess[] }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/models",
    summary: "Register a new model (admin only)",
    body: z.object({
      name: z.string(),
      description: z.string().optional(),
      provider: z.string(),
      modelId: z.string(),
      baseUrl: z.string(),
      apiKey: z.string().optional(),
      skipLiteLLM: z.boolean().optional(),
    }),
    responses: {
      201: c.type<{ model: CreatedModel }>(),
      ...commonErrorResponses,
    },
  },

  test: {
    method: "POST",
    path: "/api/models/test",
    summary: "Test connectivity to a model endpoint and fetch available models",
    body: z.object({
      provider: z.string(),
      modelId: z.string(),
      baseUrl: z.string(),
      apiKey: z.string().nullable().optional(),
    }),
    responses: {
      200: z.object({ ok: z.boolean(), models: z.array(z.string()) }),
      ...commonErrorResponses,
    },
  },

  getOne: {
    method: "GET",
    path: "/api/models/:id",
    pathParams: IdParam,
    summary: "Retrieve a model by its ID",
    responses: {
      200: c.type<{ model: ModelRegistry }>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PUT",
    path: "/api/models/:id",
    pathParams: IdParam,
    summary: "Update a model entry (admin only)",
    body: z.object({
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      provider: z.string().optional(),
      modelId: z.string().optional(),
      baseUrl: z.string().optional(),
      apiKey: z.string().nullable().optional(),
      status: z.enum(["active", "inactive"]).optional(),
    }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/models/:id",
    pathParams: IdParam,
    summary: "Delete a model by ID (admin only)",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  validate: {
    method: "POST",
    path: "/api/models/:id/validate",
    pathParams: IdParam,
    summary: "Validate connectivity to a model's endpoint",
    body: c.noBody(),
    responses: {
      200: z.object({ ok: z.boolean(), models: z.array(z.string()) }),
      ...commonErrorResponses,
    },
  },

  listRealms: {
    method: "GET",
    path: "/api/models/:id/realms",
    pathParams: IdParam,
    summary: "List realms with access to a specific model",
    responses: {
      200: c.type<{
        realms: Array<{
          realmId: string;
          realmName: string;
          grantedAt: string;
        }>;
      }>(),
      ...commonErrorResponses,
    },
  },

  grantRealm: {
    method: "POST",
    path: "/api/models/:id/realms",
    pathParams: IdParam,
    summary: "Grant realm access to a model",
    body: z.object({ realmId: z.string() }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  revokeRealm: {
    method: "DELETE",
    path: "/api/models/:id/realms",
    pathParams: IdParam,
    summary: "Revoke realm access for a model",
    query: z.object({ realmId: z.string() }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },
});

export const litellmContract = c.router({
  models: {
    method: "GET",
    path: "/api/litellm/models",
    summary: "List available models in LiteLLM",
    responses: {
      200: c.type<{
        models: Array<{ name: string; params: Record<string, unknown> }>;
        configured: boolean;
      }>(),
      ...commonErrorResponses,
    },
  },
});
