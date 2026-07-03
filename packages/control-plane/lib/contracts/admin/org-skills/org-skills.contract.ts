import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import type { OrgSkill } from "@prisma/client";
import {
  OrgSkillIdParamSchema,
  CreateOrgSkillBodySchema,
  UpdateOrgSkillBodySchema,
} from "./org-skills.schemas";

export const orgSkillsContract = c.router({
  list: {
    method: "GET",
    path: "/api/org/skills",
    summary: "List the organization skill catalog",
    responses: { 200: c.type<{ skills: OrgSkill[] }>(), ...commonErrorResponses },
  },

  create: {
    method: "POST",
    path: "/api/org/skills",
    summary: "Add a new skill to the catalog",
    body: CreateOrgSkillBodySchema,
    responses: { 201: c.type<{ skill: OrgSkill }>(), ...commonErrorResponses },
  },

  getOne: {
    method: "GET",
    path: "/api/org/skills/:id",
    pathParams: OrgSkillIdParamSchema,
    summary: "Retrieve a specific organization skill by ID",
    responses: { 200: c.type<{ skill: OrgSkill }>(), ...commonErrorResponses },
  },

  update: {
    method: "PATCH",
    path: "/api/org/skills/:id",
    pathParams: OrgSkillIdParamSchema,
    summary: "Update an organization skill",
    body: UpdateOrgSkillBodySchema,
    responses: { 200: c.type<{ skill: OrgSkill }>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/org/skills/:id",
    pathParams: OrgSkillIdParamSchema,
    summary: "Remove an organization skill from the catalog",
    responses: {
      200: z.object({ success: z.boolean() }),
      ...commonErrorResponses,
    },
  },
});
