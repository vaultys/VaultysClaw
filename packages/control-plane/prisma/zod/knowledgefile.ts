import * as z from "zod"
import { CompleteKnowledgeSource, RelatedKnowledgeSourceModel } from "./index"

export const KnowledgeFileModel = z.object({
  id: z.string(),
  sourceId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  content: z.unknown().nullish(),
  filePath: z.string().nullish(),
  createdAt: z.date(),
})

export interface CompleteKnowledgeFile extends z.infer<typeof KnowledgeFileModel> {
  source: CompleteKnowledgeSource
}

/**
 * RelatedKnowledgeFileModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedKnowledgeFileModel: z.ZodSchema<CompleteKnowledgeFile> = z.lazy(() => KnowledgeFileModel.extend({
  source: RelatedKnowledgeSourceModel,
}))
