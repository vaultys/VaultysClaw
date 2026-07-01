import { z } from "zod";

// ── Path params
export const KnowledgeIdParamSchema = z.object({ id: z.string().min(1) });
export const KnowledgeFileIdParamSchema = z.object({ fileId: z.string() });

// ── Queries
export const ListKnowledgeQuerySchema = z.object({
  workspaceId: z.string().optional(),
  agentDid: z.string().optional(),
});

export const ListFilesQuerySchema = z.object({ sourceId: z.string() });

// ── Bodies
export const CreateKnowledgeBodySchema = z.object({
  workspaceId: z.string(),
  agentDid: z.string(),
  name: z.string(),
  sourceType: z.string(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// ── Responses (schema-backed)
export const SyncResponseSchema = z.object({
  success: z.boolean(),
  messageId: z.string(),
  status: z.string(),
  docling: z.boolean(),
});
