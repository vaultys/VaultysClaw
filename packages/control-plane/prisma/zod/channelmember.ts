import * as z from "zod"
import { CompleteChannel, RelatedChannelModel } from "./index"

export const ChannelMemberModel = z.object({
  id: z.string(),
  channelId: z.string(),
  memberDid: z.string(),
  memberType: z.string(),
  role: z.string(),
  joinedAt: z.date(),
  invitedBy: z.string().nullish(),
})

export interface CompleteChannelMember extends z.infer<typeof ChannelMemberModel> {
  channel: CompleteChannel
}

/**
 * RelatedChannelMemberModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedChannelMemberModel: z.ZodSchema<CompleteChannelMember> = z.lazy(() => ChannelMemberModel.extend({
  channel: RelatedChannelModel,
}))
