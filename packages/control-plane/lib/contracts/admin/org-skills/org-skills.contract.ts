import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import type { OrgSkill } from "@prisma/client";
import {
  OrgSkillIdParamSchema,
  CreateOrgSkillBodySchema,
  UpdateOrgSkillBodySchema,
} from "./org-skills.schemas";

/**
 * Admin-only mutations of the organization skill catalog. Reading the catalog
 * (GET) is user-facing — see userContract.orgSkills.
 */
export const orgSkillsAdminContract = c.router({
  create: {
    method: "POST",
    path: "/api/admin/org/skills",
    summary: "Add a new skill to the catalog",
    body: CreateOrgSkillBodySchema,
    responses: { 201: c.type<{ skill: OrgSkill }>(), ...commonErrorResponses },
  },

  update: {
    method: "PATCH",
    path: "/api/admin/org/skills/:id",
    pathParams: OrgSkillIdParamSchema,
    summary: "Update an organization skill",
    body: UpdateOrgSkillBodySchema,
    responses: { 200: c.type<{ skill: OrgSkill }>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/admin/org/skills/:id",
    pathParams: OrgSkillIdParamSchema,
    summary: "Remove an organization skill from the catalog",
    responses: {
      200: z.object({ success: z.boolean() }),
      ...commonErrorResponses,
    },
  },
});
