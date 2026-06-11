import * as z from "zod"
import * as imports from "../null"
import { CompleteRealm, RelatedRealmModel, CompleteAgentSkillOverride, RelatedAgentSkillOverrideModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const RealmSkillModel = z.object({
  id: z.string(),
  realmId: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  version: z.string().nullish(),
  isRequired: z.boolean(),
  config: jsonSchema,
  content: z.string().nullish(),
  createdAt: z.date(),
})

export interface CompleteRealmSkill extends z.infer<typeof RealmSkillModel> {
  realm: CompleteRealm
  agentOverrides: CompleteAgentSkillOverride[]
}

/**
 * RelatedRealmSkillModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedRealmSkillModel: z.ZodSchema<CompleteRealmSkill> = z.lazy(() => RealmSkillModel.extend({
  realm: RelatedRealmModel,
  agentOverrides: RelatedAgentSkillOverrideModel.array(),
}))
