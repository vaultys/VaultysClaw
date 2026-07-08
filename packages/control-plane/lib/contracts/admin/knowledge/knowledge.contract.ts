import { c } from "../../contract";
import { commonErrorResponses, ErrorSchema } from "../../common";
import {
  KnowledgeIdParamSchema,
  KnowledgeFileIdParamSchema,
  CreateKnowledgeBodySchema,
  SyncResponseSchema,
} from "../../user/knowledge/knowledge.schemas";
import type {
  KnowledgeFileMeta,
  KnowledgeSource,
} from "../../user/knowledge/knowledge.types";

/**
 * Global-admin knowledge mutations — served under /api/admin/knowledge and gated
 * by the proxy. Read operations (list/getOne/listFiles) are workspace-scoped and
 * live in the user knowledge contract.
 */
export const knowledgeAdminContract = c.router({
  create: {
    method: "POST",
    path: "/api/admin/knowledge",
    summary: "Create a new knowledge source",
    body: CreateKnowledgeBodySchema,
    responses: {
      201: c.type<{ source: KnowledgeSource }>(),
      ...commonErrorResponses,
    },
  },

  remove: {
    method: "DELETE",
    path: "/api/admin/knowledge/:id",
    pathParams: KnowledgeIdParamSchema,
    summary: "Delete a knowledge source by ID",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  uploadFile: {
    method: "POST",
    path: "/api/admin/knowledge/files",
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
    path: "/api/admin/knowledge/files/:fileId",
    pathParams: KnowledgeFileIdParamSchema,
    summary: "Delete a knowledge file by ID",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  sync: {
    method: "POST",
    path: "/api/admin/knowledge/:id/sync",
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
