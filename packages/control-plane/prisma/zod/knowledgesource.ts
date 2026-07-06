import * as z from "zod"
import * as imports from "../null"
import { CompleteWorkspace, RelatedWorkspaceModel, CompleteAgent, RelatedAgentModel, CompleteKnowledgeFile, RelatedKnowledgeFileModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const KnowledgeSourceModel = z.object({
  id: z.string(),
  workspaceId: z.string(),
  agentDid: z.string(),
  name: z.string(),
  sourceType: z.string(),
  config: jsonSchema,
  status: z.string(),
  docCount: z.number().int(),
  chunkCount: z.number().int(),
  lastSyncedAt: z.date().nullish(),
  error: z.string().nullish(),
  createdAt: z.date(),
})

export interface CompleteKnowledgeSource extends z.infer<typeof KnowledgeSourceModel> {
  workspace: CompleteWorkspace
  agent: CompleteAgent
  files: CompleteKnowledgeFile[]
}

/**
 * RelatedKnowledgeSourceModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedKnowledgeSourceModel: z.ZodSchema<CompleteKnowledgeSource> = z.lazy(() => KnowledgeSourceModel.extend({
  workspace: RelatedWorkspaceModel,
  agent: RelatedAgentModel,
  files: RelatedKnowledgeFileModel.array(),
}))
