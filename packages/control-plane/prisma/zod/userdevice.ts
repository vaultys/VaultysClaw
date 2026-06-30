import * as z from "zod"
import { CompleteUser, RelatedUserModel } from "./index"

export const UserDeviceModel = z.object({
  id: z.string(),
  userId: z.string(),
  did: z.string(),
  publicKey: z.string().nullish(),
  name: z.string().nullish(),
  createdAt: z.date(),
  lastUsedAt: z.date().nullish(),
})

export interface CompleteUserDevice extends z.infer<typeof UserDeviceModel> {
  user: CompleteUser
}

/**
 * RelatedUserDeviceModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedUserDeviceModel: z.ZodSchema<CompleteUserDevice> = z.lazy(() => UserDeviceModel.extend({
  user: RelatedUserModel,
}))
