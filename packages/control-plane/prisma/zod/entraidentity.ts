import * as z from "zod"
import * as imports from "../null"
import { CompleteUser, RelatedUserModel } from "./index"

export const EntraIdentityModel = z.object({
  id: z.string(),
  displayName: z.string().nullish(),
  mail: z.string().nullish(),
  userPrincipalName: z.string().nullish(),
  syncedAt: z.date(),
})

export interface CompleteEntraIdentity extends z.infer<typeof EntraIdentityModel> {
  users: CompleteUser[]
}

/**
 * RelatedEntraIdentityModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedEntraIdentityModel: z.ZodSchema<CompleteEntraIdentity> = z.lazy(() => EntraIdentityModel.extend({
  users: RelatedUserModel.array(),
}))
