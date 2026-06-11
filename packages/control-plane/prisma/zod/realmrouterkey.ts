import * as z from "zod"
import { CompleteRealm, RelatedRealmModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const RealmRouterKeyModel = z.object({
  realmId: z.string(),
  litellmVirtualKey: z.string().nullish(),
  allowedModelIds: jsonSchema,
  monthlyBudgetUsd: z.number().nullish(),
  updatedAt: z.date(),
})

export interface CompleteRealmRouterKey extends z.infer<typeof RealmRouterKeyModel> {
  realm: CompleteRealm
}

/**
 * RelatedRealmRouterKeyModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedRealmRouterKeyModel: z.ZodSchema<CompleteRealmRouterKey> = z.lazy(() => RealmRouterKeyModel.extend({
  realm: RelatedRealmModel,
}))
