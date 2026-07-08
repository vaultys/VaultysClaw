import * as z from "zod"
import { CompleteWorkspace, RelatedWorkspaceModel, CompleteAgentSkillOverride, RelatedAgentSkillOverrideModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const WorkspaceSkillModel = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  version: z.string().nullish(),
  isRequired: z.boolean(),
  config: jsonSchema,
  content: z.string().nullish(),
  createdAt: z.date(),
})

export interface CompleteWorkspaceSkill extends z.infer<typeof WorkspaceSkillModel> {
  workspace: CompleteWorkspace
  agentOverrides: CompleteAgentSkillOverride[]
}

/**
 * RelatedWorkspaceSkillModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedWorkspaceSkillModel: z.ZodSchema<CompleteWorkspaceSkill> = z.lazy(() => WorkspaceSkillModel.extend({
  workspace: RelatedWorkspaceModel,
  agentOverrides: RelatedAgentSkillOverrideModel.array(),
}))
