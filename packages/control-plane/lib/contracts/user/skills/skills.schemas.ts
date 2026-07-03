import { z } from "zod";

// ── Queries
export const LibraryContentQuerySchema = z.object({ skillId: z.string() });

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
