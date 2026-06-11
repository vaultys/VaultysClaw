import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";
import type { KnowledgeFile, KnowledgeSource } from "@prisma/client";

const IdParam = z.object({ id: z.string().min(1) });

export const knowledgeContract = c.router({
  list: {
    method: "GET",
    path: "/api/knowledge",
    summary: "List knowledge sources",
    query: z.object({
      realmId: z.string().optional(),
      agentDid: z.string().optional(),
    }),
    responses: {
      200: c.type<{ sources: KnowledgeSource[] }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/knowledge",
    summary: "Create a new knowledge source",
    body: z.object({
      realmId: z.string(),
      agentDid: z.string(),
      name: z.string(),
      sourceType: z.string(),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
    responses: {
      201: c.type<{ source: KnowledgeSource }>(),
      ...commonErrorResponses,
    },
  },

  listFiles: {
    method: "GET",
    path: "/api/knowledge/files",
    summary: "List file metadata for a knowledge source",
    query: z.object({ sourceId: z.string() }),
    responses: {
      200: c.type<{ files: KnowledgeFile[] }>(),
      ...commonErrorResponses,
    },
  },

  deleteFile: {
    method: "DELETE",
    path: "/api/knowledge/files/:fileId",
    pathParams: z.object({ fileId: z.string() }),
    summary: "Delete a knowledge file by ID",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  getOne: {
    method: "GET",
    path: "/api/knowledge/:id",
    pathParams: IdParam,
    summary: "Retrieve a knowledge source by ID",
    responses: {
      200: c.type<{ source: KnowledgeSource }>(),
      ...commonErrorResponses,
    },
  },

  remove: {
    method: "DELETE",
    path: "/api/knowledge/:id",
    pathParams: IdParam,
    summary: "Delete a knowledge source by ID",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  sync: {
    method: "POST",
    path: "/api/knowledge/:id/sync",
    pathParams: IdParam,
    summary: "Initiate a sync for a knowledge source",
    body: c.noBody(),
    responses: {
      200: z.object({
        success: z.boolean(),
        messageId: z.string(),
        status: z.string(),
        docling: z.boolean(),
      }),
      ...commonErrorResponses,
    },
  },
});
