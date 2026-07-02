import * as z from "zod"
import { CompleteUser, RelatedUserModel, CompleteWorkspace, RelatedWorkspaceModel } from "./index"

export const UserWorkspaceModel = z.object({
  userId: z.string(),
  workspaceId: z.string(),
  isPrimary: z.boolean(),
  role: z.string(),
  joinedAt: z.date(),
})

export interface CompleteUserWorkspace extends z.infer<typeof UserWorkspaceModel> {
  user: CompleteUser
  workspace: CompleteWorkspace
}

/**
 * RelatedUserWorkspaceModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedUserWorkspaceModel: z.ZodSchema<CompleteUserWorkspace> = z.lazy(() => UserWorkspaceModel.extend({
  user: RelatedUserModel,
  workspace: RelatedWorkspaceModel,
}))
