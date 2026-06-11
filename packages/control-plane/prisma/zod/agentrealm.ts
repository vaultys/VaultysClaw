import * as z from "zod"
import * as imports from "../null"
import { CompleteAgent, RelatedAgentModel, CompleteRealm, RelatedRealmModel } from "./index"

export const AgentRealmModel = z.object({
  agentDid: z.string(),
  realmId: z.string(),
  isPrimary: z.boolean(),
  joinedAt: z.date(),
})

export interface CompleteAgentRealm extends z.infer<typeof AgentRealmModel> {
  agent: CompleteAgent
  realm: CompleteRealm
}

/**
 * RelatedAgentRealmModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedAgentRealmModel: z.ZodSchema<CompleteAgentRealm> = z.lazy(() => AgentRealmModel.extend({
  agent: RelatedAgentModel,
  realm: RelatedRealmModel,
}))
