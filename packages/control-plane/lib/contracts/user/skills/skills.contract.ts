import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  LibraryContentQuerySchema,
  LibraryContentResponseSchema,
  LibrarySkillSchema,
} from "./skills.schemas";

/**
 * User-facing browsing of the organization skill catalog. Managing workspace
 * skills (list/create) is admin-only — see adminContract.skills.
 */
export const skillsContract = c.router({
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
