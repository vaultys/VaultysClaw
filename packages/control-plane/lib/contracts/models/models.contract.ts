import { c } from "../contract";
import { commonErrorResponses } from "../common";
import {
  ModelIdParamSchema,
  CreateModelBodySchema,
  TestModelBodySchema,
  UpdateModelBodySchema,
  GrantRealmBodySchema,
  RevokeRealmQuerySchema,
  ModelConnectivitySchema,
} from "./models.schemas";
import type { SafeModel, CreatedModel, LiteLlmModel } from "./models.types";
import { ModelRegistry } from "@prisma/client";

export const modelsContract = c.router({
  list: {
    method: "GET",
    path: "/api/models",
    summary: "List all model registry entries",
    responses: {
      200: c.type<{ models: SafeModel[] }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/models",
    summary: "Register a new model (admin only)",
    body: CreateModelBodySchema,
    responses: {
      201: c.type<{ model: CreatedModel }>(),
      ...commonErrorResponses,
    },
  },

  test: {
    method: "POST",
    path: "/api/models/test",
    summary: "Test connectivity to a model endpoint and fetch available models",
    body: TestModelBodySchema,
    responses: {
      200: ModelConnectivitySchema,
      ...commonErrorResponses,
    },
  },

  getOne: {
    method: "GET",
    path: "/api/models/:id",
    pathParams: ModelIdParamSchema,
    summary: "Retrieve a model by its ID",
    responses: {
      200: c.type<{ model: SafeModel }>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PUT",
    path: "/api/models/:id",
    pathParams: ModelIdParamSchema,
    summary: "Update a model entry (admin only)",
    body: UpdateModelBodySchema,
    responses: {
      200: c.type<{ model: ModelRegistry }>(),
      ...commonErrorResponses,
    },
  },

  remove: {
    method: "DELETE",
    path: "/api/models/:id",
    pathParams: ModelIdParamSchema,
    summary: "Delete a model by ID (admin only)",
    responses: {
      200: c.type<{ model: ModelRegistry }>(),
      ...commonErrorResponses,
    },
  },

  validate: {
    method: "POST",
    path: "/api/models/:id/validate",
    pathParams: ModelIdParamSchema,
    summary: "Validate connectivity to a model's endpoint",
    body: c.noBody(),
    responses: {
      200: ModelConnectivitySchema,
      ...commonErrorResponses,
    },
  },

  grantRealm: {
    method: "POST",
    path: "/api/models/:id/realms",
    pathParams: ModelIdParamSchema,
    summary: "Grant realm access to a model",
    body: GrantRealmBodySchema,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  revokeRealm: {
    method: "DELETE",
    path: "/api/models/:id/realms",
    pathParams: ModelIdParamSchema,
    summary: "Revoke realm access for a model",
    query: RevokeRealmQuerySchema,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },
});

export const litellmContract = c.router({
  models: {
    method: "GET",
    path: "/api/models/litellm",
    summary: "List available models in LiteLLM",
    responses: {
      200: c.type<{
        models: Array<LiteLlmModel>;
        configured: boolean;
      }>(),
      ...commonErrorResponses,
    },
  },
});
