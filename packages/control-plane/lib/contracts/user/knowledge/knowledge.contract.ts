import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  KnowledgeIdParamSchema,
  ListKnowledgeQuerySchema,
  ListFilesQuerySchema,
} from "./knowledge.schemas";
import type { KnowledgeFileMeta, KnowledgeSource } from "./knowledge.types";

/**
 * Workspace-scoped knowledge reads — any member who can access the source's
 * workspace. Mutations (create/remove/uploadFile/deleteFile/sync) are
 * global-admin only and live in the admin knowledge contract.
 */
export const knowledgeContract = c.router({
  list: {
    method: "GET",
    path: "/api/knowledge",
    summary: "List knowledge sources",
    query: ListKnowledgeQuerySchema,
    responses: {
      200: c.type<{ sources: KnowledgeSource[] }>(),
      ...commonErrorResponses,
    },
  },

  listFiles: {
    method: "GET",
    path: "/api/knowledge/files",
    summary: "List file metadata for a knowledge source",
    query: ListFilesQuerySchema,
    responses: {
      200: c.type<{ files: KnowledgeFileMeta[] }>(),
      ...commonErrorResponses,
    },
  },

  getOne: {
    method: "GET",
    path: "/api/knowledge/:id",
    pathParams: KnowledgeIdParamSchema,
    summary: "Retrieve a knowledge source by ID",
    responses: {
      200: c.type<{ source: KnowledgeSource }>(),
      ...commonErrorResponses,
    },
  },
});
