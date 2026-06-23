import { z } from "zod";
import type { OrgSkill, RealmSkill } from "@prisma/client";
import {
  CreateSkillBodySchema,
  CreateOrgSkillBodySchema,
  UpdateOrgSkillBodySchema,
  LibrarySkillSchema,
} from "./skills.schemas";

// Prisma row types are the single source of truth for the persisted shapes.
export type { OrgSkill, RealmSkill };

/**
 * A realm skill row enriched with its realm name and usage counts — the exact
 * shape of `RealmSkillDAO.findAllWithRealms()`, surfaced by `GET /api/skills`.
 */
export type RealmSkillWithMeta = RealmSkill & {
  realmName: string;
  agentCount: number;
  overrideCount: number;
};

export type LibrarySkill = z.infer<typeof LibrarySkillSchema>;

export type CreateSkillBody = z.infer<typeof CreateSkillBodySchema>;
export type CreateOrgSkillBody = z.infer<typeof CreateOrgSkillBodySchema>;
export type UpdateOrgSkillBody = z.infer<typeof UpdateOrgSkillBodySchema>;
