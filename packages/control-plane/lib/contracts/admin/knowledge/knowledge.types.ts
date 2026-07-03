import { z } from "zod";
import type { KnowledgeFile, KnowledgeSource } from "@prisma/client";
import {
  ListKnowledgeQuerySchema,
  ListFilesQuerySchema,
  CreateKnowledgeBodySchema,
} from "./knowledge.schemas";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

// Prisma row types are the single source of truth for the persisted shapes.
export type { KnowledgeFile, KnowledgeSource };

/** File metadata as returned by the list endpoint — never includes the blob `content`. */
export type KnowledgeFileMeta = Omit<KnowledgeFile, "content">;

export type ListKnowledgeQuery = z.infer<typeof ListKnowledgeQuerySchema>;
export type ListFilesQuery = z.infer<typeof ListFilesQuerySchema>;
export type CreateKnowledgeBody = z.infer<typeof CreateKnowledgeBodySchema>;
