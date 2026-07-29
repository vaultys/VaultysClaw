import * as z from "zod"
import { CompleteProxy, RelatedProxyModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const ProxyRuleModel = z.object({
  id: z.string(),
  proxyDid: z.string(),
  method: z.string(),
  urlPattern: z.string(),
  mode: z.string(),
  governanceRule: z.string().nullish(),
  principalIdSource: jsonSchema,
})

export interface CompleteProxyRule extends z.infer<typeof ProxyRuleModel> {
  proxy: CompleteProxy
}

/**
 * RelatedProxyRuleModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedProxyRuleModel: z.ZodSchema<CompleteProxyRule> = z.lazy(() => ProxyRuleModel.extend({
  proxy: RelatedProxyModel,
}))
