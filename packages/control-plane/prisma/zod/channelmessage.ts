import * as z from "zod"
import { CompleteChannel, RelatedChannelModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const ChannelMessageModel = z.object({
  id: z.string(),
  channelId: z.string(),
  threadId: z.string().nullish(),
  authorDid: z.string(),
  authorType: z.string(),
  content: z.string(),
  metadata: jsonSchema,
  reactions: jsonSchema,
  editedAt: z.date().nullish(),
  deletedAt: z.date().nullish(),
  createdAt: z.date(),
})

export interface CompleteChannelMessage extends z.infer<typeof ChannelMessageModel> {
  channel: CompleteChannel
  thread?: CompleteChannelMessage | null
  replies: CompleteChannelMessage[]
}

/**
 * RelatedChannelMessageModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedChannelMessageModel: z.ZodSchema<CompleteChannelMessage> = z.lazy(() => ChannelMessageModel.extend({
  channel: RelatedChannelModel,
  thread: RelatedChannelMessageModel.nullish(),
  replies: RelatedChannelMessageModel.array(),
}))
