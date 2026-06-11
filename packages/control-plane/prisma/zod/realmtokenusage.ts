import * as z from "zod"
import * as imports from "../null"
import { CompleteRealm, RelatedRealmModel } from "./index"

export const RealmTokenUsageModel = z.object({
  realmId: z.string(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  updatedAt: z.date(),
})

export interface CompleteRealmTokenUsage extends z.infer<typeof RealmTokenUsageModel> {
  realm: CompleteRealm
}

/**
 * RelatedRealmTokenUsageModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedRealmTokenUsageModel: z.ZodSchema<CompleteRealmTokenUsage> = z.lazy(() => RealmTokenUsageModel.extend({
  realm: RelatedRealmModel,
}))
