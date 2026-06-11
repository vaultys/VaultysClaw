import * as z from "zod"
import * as imports from "../null"
import { CompleteUser, RelatedUserModel, CompleteRealm, RelatedRealmModel } from "./index"

export const UserRealmModel = z.object({
  userId: z.string(),
  realmId: z.string(),
  isPrimary: z.boolean(),
  isRealmAdmin: z.boolean(),
  joinedAt: z.date(),
})

export interface CompleteUserRealm extends z.infer<typeof UserRealmModel> {
  user: CompleteUser
  realm: CompleteRealm
}

/**
 * RelatedUserRealmModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedUserRealmModel: z.ZodSchema<CompleteUserRealm> = z.lazy(() => UserRealmModel.extend({
  user: RelatedUserModel,
  realm: RelatedRealmModel,
}))
