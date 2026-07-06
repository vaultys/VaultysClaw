import * as z from "zod"
import * as imports from "../null"
import { CompleteWorkspace, RelatedWorkspaceModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const CredentialModel = z.object({
  id: z.string(),
  workspaceId: z.string(),
  service: z.string(),
  name: z.string(),
  secretEnc: z.string(),
  metadata: jsonSchema,
  createdBy: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export interface CompleteCredential extends z.infer<typeof CredentialModel> {
  workspace: CompleteWorkspace
}

/**
 * RelatedCredentialModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedCredentialModel: z.ZodSchema<CompleteCredential> = z.lazy(() => CredentialModel.extend({
  workspace: RelatedWorkspaceModel,
}))
