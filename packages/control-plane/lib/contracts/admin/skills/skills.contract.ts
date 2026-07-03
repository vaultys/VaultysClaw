import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import type { WorkspaceSkill } from "@prisma/client";
import { CreateSkillBodySchema } from "./skills.schemas";
import type { WorkspaceSkillWithMeta } from "./skills.types";

/**
 * Admin-only workspace-skill management. Browsing the org catalog (library) is
 * user-facing — see userContract.skills.
 */
export const skillsAdminContract = c.router({
  list: {
    method: "GET",
    path: "/api/admin/skills",
    summary: "Retrieve every workspace skill enriched with workspace + usage info",
    responses: {
      200: c.type<WorkspaceSkillWithMeta[]>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/admin/skills",
    summary: "Create a new skill in a specified workspace",
    body: CreateSkillBodySchema,
    responses: { 201: c.type<WorkspaceSkill>(), ...commonErrorResponses },
  },
});
