import { z } from "zod";

// ── Queries
export const ListPoliciesQuerySchema = z.object({
  agentDid: z.string().optional(),
  realmId: z.string().optional(),
  includeExpired: z.coerce.boolean().optional(),
  expiredOnly: z.coerce.boolean().optional(),
});

// ── Bodies
export const CreatePolicyBodySchema = z.object({
  agentDid: z.string().optional(),
  realmId: z.string().optional(),
  capabilities: z.array(z.string()).min(1),
  resourceLimits: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.string().optional(),
  broadcast: z.boolean().optional(),
});

// ── Path params
export const PolicyIdParamSchema = z.object({ id: z.string().min(1) });

// ── Responses (schema-backed)
export const RemovePolicyResponseSchema = z.object({
  ok: z.boolean(),
  sentTo: z.array(z.string()),
});
