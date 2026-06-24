import { z } from "zod";

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export const ListCredentialsQuerySchema = z.object({
  service: z.string().optional(),
});

export const DeleteCredentialQuerySchema = z.object({
  service: z.string(),
  name: z.string(),
});

export const ListRealmsQuerySchema = z.object({
  userId: z.string().optional(),
});

// ─────────────────────────────────────────────
// Bodies
// ─────────────────────────────────────────────

export const CreateRealmBodySchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
});

export const UpdateRealmBodySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  llmConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  defaultCapabilities: z.array(z.string()).optional(),
  tokenBudgetDaily: z.number().nullable().optional(),
  tokenBudgetMonthly: z.number().nullable().optional(),
  allowedCapabilities: z.array(z.string()).nullable().optional(),
});

export const AddRealmUserBodySchema = z.object({
  userDid: z.string(),
  isPrimary: z.boolean().optional(),
  isRealmAdmin: z.boolean().optional(),
});

export const UpdateRealmUserBodySchema = z.object({
  userDid: z.string(),
  isRealmAdmin: z.boolean(),
});

export const RemoveRealmUserBodySchema = z.object({ userDid: z.string() });

export const SocialMediaBodySchema = z.object({ text: z.string().max(280) });

export const CreateRealmSkillBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  isRequired: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateRealmSkillBodySchema = z.object({
  description: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  isRequired: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  content: z.string().nullable().optional(),
});

export const PutRealmLitellmKeyBodySchema = z.object({
  monthlyBudget: z.number().nullable().optional(),
});

export const SaveCredentialBodySchema = z.object({
  service: z.string(),
  name: z.string(),
  secret: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const AddRealmAgentBodySchema = z.object({
  agentDid: z.string(),
  isPrimary: z.boolean().optional(),
});

export const RemoveRealmAgentBodySchema = z.object({ agentDid: z.string() });
