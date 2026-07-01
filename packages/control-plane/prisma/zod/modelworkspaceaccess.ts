import * as z from "zod"
import { CompleteModelRegistry, RelatedModelRegistryModel, CompleteWorkspace, RelatedWorkspaceModel } from "./index"

export const ModelWorkspaceAccessModel = z.object({
  modelId: z.string(),
  workspaceId: z.string(),
  grantedAt: z.date(),
})

export interface CompleteModelWorkspaceAccess extends z.infer<typeof ModelWorkspaceAccessModel> {
  model: CompleteModelRegistry
  workspace: CompleteWorkspace
}

/**
 * RelatedModelWorkspaceAccessModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedModelWorkspaceAccessModel: z.ZodSchema<CompleteModelWorkspaceAccess> = z.lazy(() => ModelWorkspaceAccessModel.extend({
  model: RelatedModelRegistryModel,
  workspace: RelatedWorkspaceModel,
}))
