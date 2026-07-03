import { c } from "../../contract";
import { commonErrorResponses, ErrorSchema } from "../../common";
import {
  KnowledgeIdParamSchema,
  KnowledgeFileIdParamSchema,
  ListKnowledgeQuerySchema,
  ListFilesQuerySchema,
  CreateKnowledgeBodySchema,
  SyncResponseSchema,
} from "./knowledge.schemas";
import type { KnowledgeFileMeta, KnowledgeSource } from "./knowledge.types";

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

  create: {
    method: "POST",
    path: "/api/knowledge",
    summary: "Create a new knowledge source",
    body: CreateKnowledgeBodySchema,
    responses: {
      201: c.type<{ source: KnowledgeSource }>(),
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

  uploadFile: {
    method: "POST",
    path: "/api/knowledge/files",
    summary: "Upload a file attached to a knowledge source (multipart/form-data)",
    // multipart/form-data — read as FormData in the handler, so the body is
    // declared as an opaque type (not a Zod schema) to keep createNextRoute
    // from consuming the request stream as JSON.
    body: c.type<unknown>(),
    responses: {
      201: c.type<{ file: KnowledgeFileMeta }>(),
      ...commonErrorResponses,
    },
  },

  deleteFile: {
    method: "DELETE",
    path: "/api/knowledge/files/:fileId",
    pathParams: KnowledgeFileIdParamSchema,
    summary: "Delete a knowledge file by ID",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
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

  remove: {
    method: "DELETE",
    path: "/api/knowledge/:id",
    pathParams: KnowledgeIdParamSchema,
    summary: "Delete a knowledge source by ID",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  sync: {
    method: "POST",
    path: "/api/knowledge/:id/sync",
    pathParams: KnowledgeIdParamSchema,
    summary: "Initiate a sync for a knowledge source",
    body: c.noBody(),
    responses: {
      200: SyncResponseSchema,
      409: ErrorSchema,
      ...commonErrorResponses,
    },
  },
});
