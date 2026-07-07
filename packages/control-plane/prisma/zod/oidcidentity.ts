import * as z from "zod"
import { CompleteUser, RelatedUserModel } from "./index"

export const OidcIdentityModel = z.object({
  sub: z.string(),
  issuer: z.string(),
  email: z.string().nullish(),
  name: z.string().nullish(),
  syncedAt: z.date(),
})

export interface CompleteOidcIdentity extends z.infer<typeof OidcIdentityModel> {
  users: CompleteUser[]
}

/**
 * RelatedOidcIdentityModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedOidcIdentityModel: z.ZodSchema<CompleteOidcIdentity> = z.lazy(() => OidcIdentityModel.extend({
  users: RelatedUserModel.array(),
}))
