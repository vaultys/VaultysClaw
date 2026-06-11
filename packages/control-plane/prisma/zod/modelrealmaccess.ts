import * as z from "zod"
import * as imports from "../null"
import { CompleteModelRegistry, RelatedModelRegistryModel, CompleteRealm, RelatedRealmModel } from "./index"

export const ModelRealmAccessModel = z.object({
  modelId: z.string(),
  realmId: z.string(),
  grantedAt: z.date(),
})

export interface CompleteModelRealmAccess extends z.infer<typeof ModelRealmAccessModel> {
  model: CompleteModelRegistry
  realm: CompleteRealm
}

/**
 * RelatedModelRealmAccessModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedModelRealmAccessModel: z.ZodSchema<CompleteModelRealmAccess> = z.lazy(() => ModelRealmAccessModel.extend({
  model: RelatedModelRegistryModel,
  realm: RelatedRealmModel,
}))
