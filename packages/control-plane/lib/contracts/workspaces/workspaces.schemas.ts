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

export const ListWorkspacesQuerySchema = z.object({
  userId: z.string().optional(),
});

// ─────────────────────────────────────────────
// Bodies
// ─────────────────────────────────────────────

export const CreateWorkspaceBodySchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
});

export const UpdateWorkspaceBodySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  llmConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  defaultCapabilities: z.array(z.string()).optional(),
  tokenBudgetDaily: z.number().nullable().optional(),
  tokenBudgetMonthly: z.number().nullable().optional(),
  allowedCapabilities: z.array(z.string()).nullable().optional(),
});

export const AddWorkspaceUserBodySchema = z.object({
  userDid: z.string(),
  isPrimary: z.boolean().optional(),
  isWorkspaceAdmin: z.boolean().optional(),
});

export const UpdateWorkspaceUserBodySchema = z.object({
  userDid: z.string(),
  isWorkspaceAdmin: z.boolean(),
});

export const RemoveWorkspaceUserBodySchema = z.object({ userDid: z.string() });

export const SocialMediaBodySchema = z.object({ text: z.string().max(280) });

export const CreateWorkspaceSkillBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  isRequired: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateWorkspaceSkillBodySchema = z.object({
  description: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  isRequired: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  content: z.string().nullable().optional(),
});

export const PutWorkspaceLitellmKeyBodySchema = z.object({
  monthlyBudget: z.number().nullable().optional(),
});

export const SaveCredentialBodySchema = z.object({
  service: z.string(),
  name: z.string(),
  secret: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const AddWorkspaceAgentBodySchema = z.object({
  agentDid: z.string(),
  isPrimary: z.boolean().optional(),
});

export const RemoveWorkspaceAgentBodySchema = z.object({ agentDid: z.string() });
