import { z } from "zod";
import type { WorkspaceSkill } from "@prisma/client";
import { CreateSkillBodySchema, LibrarySkillSchema } from "./skills.schemas";

// Prisma row types are the single source of truth for the persisted shapes.
export type { WorkspaceSkill };

/**
 * A workspace skill row enriched with its workspace name and usage counts — the exact
 * shape of `WorkspaceSkillDAO.findAllWithWorkspaces()`, surfaced by `GET /api/skills`.
 */
export type WorkspaceSkillWithMeta = WorkspaceSkill & {
  workspaceName: string;
  agentCount: number;
  overrideCount: number;
};

export type LibrarySkill = z.infer<typeof LibrarySkillSchema>;
export type CreateSkillBody = z.infer<typeof CreateSkillBodySchema>;
