import { z } from "zod";

// ── Path params
export const ModelIdParamSchema = z.object({ id: z.string().min(1) });

// ── Bodies
export const CreateModelBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  provider: z.string(),
  modelId: z.string(),
  baseUrl: z.string(),
  apiKey: z.string().optional(),
  skipLiteLLM: z.boolean().optional(),
});

export const TestModelBodySchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  baseUrl: z.string(),
  apiKey: z.string().nullable().optional(),
});

export const UpdateModelBodySchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  provider: z.string().optional(),
  modelId: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const GrantRealmBodySchema = z.object({ realmId: z.string() });

// ── Queries
export const RevokeRealmQuerySchema = z.object({ realmId: z.string() });

// ── Responses
export const ModelConnectivitySchema = z.object({
  ok: z.boolean(),
  models: z.array(z.string()),
  error: z.string().optional(),
});
