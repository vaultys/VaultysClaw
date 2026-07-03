import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import type { WorkspaceSkill } from "@prisma/client";
import {
  LibraryContentQuerySchema,
  LibraryContentResponseSchema,
  LibrarySkillSchema,
  CreateSkillBodySchema,
} from "./skills.schemas";
import type { WorkspaceSkillWithMeta } from "./skills.types";

export const skillsContract = c.router({
  list: {
    method: "GET",
    path: "/api/skills",
    summary: "Retrieve every workspace skill enriched with workspace + usage info",
    responses: {
      200: c.type<WorkspaceSkillWithMeta[]>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/skills",
    summary: "Create a new skill in a specified workspace",
    body: CreateSkillBodySchema,
    responses: { 201: c.type<WorkspaceSkill>(), ...commonErrorResponses },
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
