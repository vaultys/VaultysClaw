import { z } from "zod";

// ── Path params
export const OrgSkillIdParamSchema = z.object({ id: z.string().min(1) });

// ── Queries
export const LibraryContentQuerySchema = z.object({ skillId: z.string() });

// ── Bodies
export const CreateSkillBodySchema = z.object({
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  isRequired: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  content: z.string().nullable().optional(),
});

export const CreateOrgSkillBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  icon: z.string().optional(),
  content: z.string().optional(),
  configSchema: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateOrgSkillBodySchema = z.object({
  description: z.string().nullable().optional(),
  version: z.string().optional(),
  icon: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  configSchema: z.record(z.string(), z.unknown()).optional(),
});

// ── Responses (schema-backed)

/**
 * Org catalog entry as surfaced to the skills library modal — a DTO mapped from
 * the `OrgSkill` Prisma row, not a persisted shape, so it lives as a schema.
 */
export const LibrarySkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  source: z.string(),
  skillId: z.string(),
  installs: z.number(),
  githubStars: z.number(),
  repoUrl: z.string(),
  standalone: z.boolean(),
  icon: z.string().nullable().optional(),
  version: z.string().optional(),
  content: z.string().nullable().optional(),
  contentType: z.object({
    hasInstructions: z.boolean(),
    hasScripts: z.boolean(),
    hasReferences: z.boolean(),
    hasAssets: z.boolean(),
  }),
});

export const LibraryContentResponseSchema = z.object({ content: z.string() });
