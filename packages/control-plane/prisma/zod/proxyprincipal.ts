import * as z from "zod"
import { CompleteProxy, RelatedProxyModel } from "./index"

export const ProxyPrincipalModel = z.object({
  id: z.string(),
  proxyDid: z.string(),
  tag: z.string().nullish(),
  externalId: z.string().nullish(),
  did: z.string(),
  governanceRules: z.string().array(),
  status: z.string(),
  provisionedByProxy: z.boolean(),
  firstSeenAt: z.date(),
  lastSeenAt: z.date(),
})

export interface CompleteProxyPrincipal extends z.infer<typeof ProxyPrincipalModel> {
  proxy: CompleteProxy
}

/**
 * RelatedProxyPrincipalModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedProxyPrincipalModel: z.ZodSchema<CompleteProxyPrincipal> = z.lazy(() => ProxyPrincipalModel.extend({
  proxy: RelatedProxyModel,
}))
