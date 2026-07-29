import * as z from "zod"
import { CompleteProxy, RelatedProxyModel } from "./index"

export const ProxyActivityLogModel = z.object({
  id: z.string(),
  proxyDid: z.string(),
  principalDid: z.string().nullish(),
  method: z.string(),
  url: z.string(),
  ruleId: z.string().nullish(),
  mode: z.string(),
  verdict: z.string(),
  reason: z.string().nullish(),
  identitySource: z.string().nullish(),
  timestamp: z.date(),
  latencyMs: z.number().int().nullish(),
})

export interface CompleteProxyActivityLog extends z.infer<typeof ProxyActivityLogModel> {
  proxy: CompleteProxy
}

/**
 * RelatedProxyActivityLogModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedProxyActivityLogModel: z.ZodSchema<CompleteProxyActivityLog> = z.lazy(() => ProxyActivityLogModel.extend({
  proxy: RelatedProxyModel,
}))
