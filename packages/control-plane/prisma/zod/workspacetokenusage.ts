import * as z from "zod"
import { CompleteWorkspace, RelatedWorkspaceModel } from "./index"

export const WorkspaceTokenUsageModel = z.object({
  workspaceId: z.string(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  updatedAt: z.date(),
})

export interface CompleteWorkspaceTokenUsage extends z.infer<typeof WorkspaceTokenUsageModel> {
  workspace: CompleteWorkspace
}

/**
 * RelatedWorkspaceTokenUsageModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedWorkspaceTokenUsageModel: z.ZodSchema<CompleteWorkspaceTokenUsage> = z.lazy(() => WorkspaceTokenUsageModel.extend({
  workspace: RelatedWorkspaceModel,
}))
