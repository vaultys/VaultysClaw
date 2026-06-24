import { z } from "zod";
import { c } from "../contract";
import { commonErrorResponses } from "../common";
import type { OrgSkill, RealmSkill } from "@prisma/client";
import {
  OrgSkillIdParamSchema,
  LibraryContentQuerySchema,
  LibraryContentResponseSchema,
  LibrarySkillSchema,
  CreateSkillBodySchema,
  CreateOrgSkillBodySchema,
  UpdateOrgSkillBodySchema,
} from "./skills.schemas";
import type { RealmSkillWithMeta } from "./skills.types";

export const skillsContract = c.router({
  list: {
    method: "GET",
    path: "/api/skills",
    summary: "Retrieve every realm skill enriched with realm + usage info",
    responses: {
      200: c.type<RealmSkillWithMeta[]>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/skills",
    summary: "Create a new skill in a specified realm",
    body: CreateSkillBodySchema,
    responses: { 201: c.type<RealmSkill>(), ...commonErrorResponses },
  },

  library: {
    method: "GET",
    path: "/api/skills/library",
    summary: "Retrieve the organisation's skill catalog",
    responses: {
      200: z.array(LibrarySkillSchema),
      ...commonErrorResponses,
    },
  },

  libraryContent: {
    method: "GET",
    path: "/api/skills/library/content",
    summary: "Retrieve markdown instructions for an organization skill by name",
    query: LibraryContentQuerySchema,
    responses: {
      200: LibraryContentResponseSchema,
      ...commonErrorResponses,
    },
  },
});

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
