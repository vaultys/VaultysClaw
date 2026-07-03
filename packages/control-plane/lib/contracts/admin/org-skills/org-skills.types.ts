import { z } from "zod";
import type { OrgSkill } from "@prisma/client";
import {
  CreateOrgSkillBodySchema,
  UpdateOrgSkillBodySchema,
} from "./org-skills.schemas";

// Prisma row types are the single source of truth for the persisted shapes.
export type { OrgSkill };

export type CreateOrgSkillBody = z.infer<typeof CreateOrgSkillBodySchema>;
export type UpdateOrgSkillBody = z.infer<typeof UpdateOrgSkillBodySchema>;
