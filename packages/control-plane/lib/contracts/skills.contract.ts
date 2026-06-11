import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";
import type { OrgSkill, RealmSkill } from "@prisma/client";

const IdParam = z.object({ id: z.string().min(1) });

export const skillsContract = c.router({
  list: {
    method: "GET",
    path: "/api/skills",
    summary: "Retrieve all skills with their associated realms",
    responses: {
      200: c.type<Array<RealmSkill & { realms?: unknown[] }>>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/skills",
    summary: "Create a new skill in a specified realm",
    body: z.object({
      realmId: z.string(),
      name: z.string(),
      description: z.string().optional(),
      version: z.string().optional(),
      isRequired: z.boolean().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
    responses: { 201: c.type<RealmSkill>(), ...commonErrorResponses },
  },

  library: {
    method: "GET",
    path: "/api/skills/library",
    summary: "Retrieve the organisation's skill catalog",
    responses: { 200: c.type<OrgSkill[]>(), ...commonErrorResponses },
  },

  libraryContent: {
    method: "GET",
    path: "/api/skills/library/content",
    summary: "Retrieve markdown instructions for an organization skill by name",
    query: z.object({ skillId: z.string() }),
    responses: { 200: z.object({ content: z.string() }), ...commonErrorResponses },
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
    body: z.object({
      name: z.string(),
      description: z.string().optional(),
      version: z.string().optional(),
      icon: z.string().optional(),
      content: z.string().optional(),
      configSchema: z.record(z.string(), z.unknown()).optional(),
    }),
    responses: { 201: c.type<{ skill: OrgSkill }>(), ...commonErrorResponses },
  },

  getOne: {
    method: "GET",
    path: "/api/org/skills/:id",
    pathParams: IdParam,
    summary: "Retrieve a specific organization skill by ID",
    responses: { 200: c.type<{ skill: OrgSkill }>(), ...commonErrorResponses },
  },

  update: {
    method: "PATCH",
    path: "/api/org/skills/:id",
    pathParams: IdParam,
    summary: "Update an organization skill",
    body: z.object({
      description: z.string().nullable().optional(),
      version: z.string().optional(),
      icon: z.string().nullable().optional(),
      content: z.string().nullable().optional(),
      configSchema: z.record(z.string(), z.unknown()).optional(),
    }),
    responses: { 200: c.type<OrgSkill>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/org/skills/:id",
    pathParams: IdParam,
    summary: "Remove an organization skill from the catalog",
    responses: { 200: z.object({ success: z.boolean() }), ...commonErrorResponses },
  },
});
