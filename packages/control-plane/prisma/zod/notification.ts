import * as z from "zod"
import { CompleteUser, RelatedUserModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const NotificationModel = z.object({
  id: z.string(),
  userId: z.string(),
  eventType: z.string(),
  title: z.string(),
  body: z.string(),
  data: jsonSchema,
  readAt: z.date().nullish(),
  createdAt: z.date(),
})

export interface CompleteNotification extends z.infer<typeof NotificationModel> {
  user: CompleteUser
}

/**
 * RelatedNotificationModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedNotificationModel: z.ZodSchema<CompleteNotification> = z.lazy(() => NotificationModel.extend({
  user: RelatedUserModel,
}))
