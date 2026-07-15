import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import type { OrgSkill } from "@prisma/client";

/**
 * Read access to the organization skill catalog — any authenticated user. The
 * mutating endpoints (create/update/remove) are admin-only, see
 * adminContract.orgSkills (orgSkillsAdminContract).
 */
export const orgSkillsContract = c.router({
  list: {
    method: "GET",
    path: "/api/org/skills",
    summary: "List the organization skill catalog",
    responses: { 200: c.type<{ skills: OrgSkill[] }>(), ...commonErrorResponses },
  },

  getOne: {
    method: "GET",
    path: "/api/org/skills/:id",
    pathParams: z.object({ id: z.string().min(1) }),
    summary: "Retrieve a specific organization skill by ID",
    responses: { 200: c.type<{ skill: OrgSkill }>(), ...commonErrorResponses },
  },
});
