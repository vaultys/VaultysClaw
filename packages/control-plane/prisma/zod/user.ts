import * as z from "zod"
import { CompleteEntraIdentity, RelatedEntraIdentityModel, CompleteOidcIdentity, RelatedOidcIdentityModel, CompleteUserRealm, RelatedUserRealmModel, CompleteUserGrant, RelatedUserGrantModel, CompleteUserInvitation, RelatedUserInvitationModel } from "./index"

export const UserModel = z.object({
  id: z.string(),
  did: z.string().nullish(),
  publicKey: z.string().nullish(),
  name: z.string().nullish(),
  email: z.string().nullish(),
  role: z.string(),
  reportsTo: z.string().nullish(),
  description: z.string().nullish(),
  entraId: z.string().nullish(),
  oidcId: z.string().nullish(),
  claimedAt: z.date().nullish(),
  registeredAt: z.date(),
  locationLat: z.number().nullish(),
  locationLon: z.number().nullish(),
  locationLabel: z.string().nullish(),
})

export interface CompleteUser extends z.infer<typeof UserModel> {
  manager?: CompleteUser | null
  reports: CompleteUser[]
  entraIdentity?: CompleteEntraIdentity | null
  oidcIdentity?: CompleteOidcIdentity | null
  userRealms: CompleteUserRealm[]
  userGrants: CompleteUserGrant[]
  invitations: CompleteUserInvitation[]
}

/**
 * RelatedUserModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedUserModel: z.ZodSchema<CompleteUser> = z.lazy(() => UserModel.extend({
  manager: RelatedUserModel.nullish(),
  reports: RelatedUserModel.array(),
  entraIdentity: RelatedEntraIdentityModel.nullish(),
  oidcIdentity: RelatedOidcIdentityModel.nullish(),
  userRealms: RelatedUserRealmModel.array(),
  userGrants: RelatedUserGrantModel.array(),
  invitations: RelatedUserInvitationModel.array(),
}))
