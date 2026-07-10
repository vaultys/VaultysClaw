import * as z from "zod"
import { CompleteUser, RelatedUserModel } from "./index"

export const NotificationPreferenceModel = z.object({
  id: z.string(),
  userId: z.string(),
  eventType: z.string(),
  inApp: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
})

export interface CompleteNotificationPreference extends z.infer<typeof NotificationPreferenceModel> {
  user: CompleteUser
}

/**
 * RelatedNotificationPreferenceModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedNotificationPreferenceModel: z.ZodSchema<CompleteNotificationPreference> = z.lazy(() => NotificationPreferenceModel.extend({
  user: RelatedUserModel,
}))
