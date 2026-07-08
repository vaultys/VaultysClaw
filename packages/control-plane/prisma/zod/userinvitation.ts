import * as z from "zod"
import { CompleteUser, RelatedUserModel } from "./index"

export const UserInvitationModel = z.object({
  token: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  createdAt: z.date(),
  expiresAt: z.date(),
  claimedAt: z.date().nullish(),
  userId: z.string().nullish(),
})

export interface CompleteUserInvitation extends z.infer<typeof UserInvitationModel> {
  user?: CompleteUser | null
}

/**
 * RelatedUserInvitationModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedUserInvitationModel: z.ZodSchema<CompleteUserInvitation> = z.lazy(() => UserInvitationModel.extend({
  user: RelatedUserModel.nullish(),
}))
