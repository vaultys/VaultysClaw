import * as z from "zod"
import { CompleteRealm, RelatedRealmModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const PolicyModel = z.object({
  id: z.string(),
  agentDid: z.string().nullish(),
  realmId: z.string().nullish(),
  capabilities: jsonSchema,
  resourceLimits: jsonSchema,
  expiresAt: z.date().nullish(),
  createdBy: z.string().nullish(),
  createdAt: z.date(),
})

export interface CompletePolicy extends z.infer<typeof PolicyModel> {
  realm?: CompleteRealm | null
}

/**
 * RelatedPolicyModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedPolicyModel: z.ZodSchema<CompletePolicy> = z.lazy(() => PolicyModel.extend({
  realm: RelatedRealmModel.nullish(),
}))
