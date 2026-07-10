import * as z from "zod"
import { CompleteEntraIdentity, RelatedEntraIdentityModel, CompleteOidcIdentity, RelatedOidcIdentityModel, CompleteUserWorkspace, RelatedUserWorkspaceModel, CompleteUserGrant, RelatedUserGrantModel, CompleteUserInvitation, RelatedUserInvitationModel, CompleteNotificationPreference, RelatedNotificationPreferenceModel, CompleteNotification, RelatedNotificationModel } from "./index"

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
  userWorkspaces: CompleteUserWorkspace[]
  userGrants: CompleteUserGrant[]
  invitations: CompleteUserInvitation[]
  notificationPreferences: CompleteNotificationPreference[]
  notifications: CompleteNotification[]
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
  userWorkspaces: RelatedUserWorkspaceModel.array(),
  userGrants: RelatedUserGrantModel.array(),
  invitations: RelatedUserInvitationModel.array(),
  notificationPreferences: RelatedNotificationPreferenceModel.array(),
  notifications: RelatedNotificationModel.array(),
}))
