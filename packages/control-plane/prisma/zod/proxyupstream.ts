import * as z from "zod"
import { CompleteProxy, RelatedProxyModel } from "./index"

export const ProxyUpstreamModel = z.object({
  id: z.string(),
  proxyDid: z.string(),
  name: z.string(),
  baseUrl: z.string(),
})

export interface CompleteProxyUpstream extends z.infer<typeof ProxyUpstreamModel> {
  proxy: CompleteProxy
}

/**
 * RelatedProxyUpstreamModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedProxyUpstreamModel: z.ZodSchema<CompleteProxyUpstream> = z.lazy(() => ProxyUpstreamModel.extend({
  proxy: RelatedProxyModel,
}))
