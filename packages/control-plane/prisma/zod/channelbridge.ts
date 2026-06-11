import * as z from "zod"
import { CompleteChannel, RelatedChannelModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const ChannelBridgeModel = z.object({
  id: z.string(),
  channelId: z.string(),
  externalService: z.string(),
  externalChannelId: z.string(),
  externalChannelName: z.string(),
  externalWorkspaceId: z.string(),
  syncDirection: z.string(),
  isSyncEnabled: z.boolean(),
  createdAt: z.date(),
  configJson: jsonSchema,
})

export interface CompleteChannelBridge extends z.infer<typeof ChannelBridgeModel> {
  channel: CompleteChannel
}

/**
 * RelatedChannelBridgeModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedChannelBridgeModel: z.ZodSchema<CompleteChannelBridge> = z.lazy(() => ChannelBridgeModel.extend({
  channel: RelatedChannelModel,
}))
