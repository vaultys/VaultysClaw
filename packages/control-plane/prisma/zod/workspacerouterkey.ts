import * as z from "zod"
import { CompleteWorkspace, RelatedWorkspaceModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const WorkspaceRouterKeyModel = z.object({
  workspaceId: z.string(),
  litellmVirtualKey: z.string().nullish(),
  allowedModelIds: jsonSchema,
  monthlyBudgetUsd: z.number().nullish(),
  updatedAt: z.date(),
})

export interface CompleteWorkspaceRouterKey extends z.infer<typeof WorkspaceRouterKeyModel> {
  workspace: CompleteWorkspace
}

/**
 * RelatedWorkspaceRouterKeyModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedWorkspaceRouterKeyModel: z.ZodSchema<CompleteWorkspaceRouterKey> = z.lazy(() => WorkspaceRouterKeyModel.extend({
  workspace: RelatedWorkspaceModel,
}))
