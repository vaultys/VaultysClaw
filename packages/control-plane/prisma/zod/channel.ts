import * as z from "zod"
import * as imports from "../null"
import { CompleteRealm, RelatedRealmModel, CompleteChannelMember, RelatedChannelMemberModel, CompleteChannelMessage, RelatedChannelMessageModel, CompleteChannelBridge, RelatedChannelBridgeModel } from "./index"

export const ChannelModel = z.object({
  id: z.string(),
  realmId: z.string().nullish(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullish(),
  isPublic: z.boolean(),
  isArchived: z.boolean(),
  topic: z.string().nullish(),
  creatorDid: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export interface CompleteChannel extends z.infer<typeof ChannelModel> {
  realm?: CompleteRealm | null
  members: CompleteChannelMember[]
  messages: CompleteChannelMessage[]
  bridges: CompleteChannelBridge[]
}

/**
 * RelatedChannelModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedChannelModel: z.ZodSchema<CompleteChannel> = z.lazy(() => ChannelModel.extend({
  realm: RelatedRealmModel.nullish(),
  members: RelatedChannelMemberModel.array(),
  messages: RelatedChannelMessageModel.array(),
  bridges: RelatedChannelBridgeModel.array(),
}))
