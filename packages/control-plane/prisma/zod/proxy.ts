import * as z from "zod"
import { CompleteProxyUpstream, RelatedProxyUpstreamModel, CompleteProxyRule, RelatedProxyRuleModel, CompleteProxyPrincipal, RelatedProxyPrincipalModel, CompleteProxyActivityLog, RelatedProxyActivityLogModel } from "./index"

export const ProxyModel = z.object({
  did: z.string(),
  name: z.string(),
  publicKey: z.string().nullish(),
  defaultMode: z.string(),
  registeredAt: z.date(),
  lastSeen: z.date(),
})

export interface CompleteProxy extends z.infer<typeof ProxyModel> {
  upstreams: CompleteProxyUpstream[]
  rules: CompleteProxyRule[]
  principals: CompleteProxyPrincipal[]
  activityLogs: CompleteProxyActivityLog[]
}

/**
 * RelatedProxyModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedProxyModel: z.ZodSchema<CompleteProxy> = z.lazy(() => ProxyModel.extend({
  upstreams: RelatedProxyUpstreamModel.array(),
  rules: RelatedProxyRuleModel.array(),
  principals: RelatedProxyPrincipalModel.array(),
  activityLogs: RelatedProxyActivityLogModel.array(),
}))
