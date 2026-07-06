import * as z from "zod"
import * as imports from "../null"
import { CompleteModelWorkspaceAccess, RelatedModelWorkspaceAccessModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const ModelRegistryModel = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  provider: z.string(),
  modelId: z.string(),
  baseUrl: z.string(),
  apiKeyEnc: z.string().nullish(),
  litellmModelName: z.string().nullish(),
  status: z.string(),
  metadata: jsonSchema,
  createdBy: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export interface CompleteModelRegistry extends z.infer<typeof ModelRegistryModel> {
  workspaceAccess: CompleteModelWorkspaceAccess[]
}

/**
 * RelatedModelRegistryModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedModelRegistryModel: z.ZodSchema<CompleteModelRegistry> = z.lazy(() => ModelRegistryModel.extend({
  workspaceAccess: RelatedModelWorkspaceAccessModel.array(),
}))
