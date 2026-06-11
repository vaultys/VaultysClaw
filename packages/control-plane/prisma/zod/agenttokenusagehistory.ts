import * as z from "zod"
import { CompleteAgent, RelatedAgentModel } from "./index"

export const AgentTokenUsageHistoryModel = z.object({
  agentDid: z.string(),
  bucket: z.string(),
  granularity: z.string(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  updatedAt: z.date(),
})

export interface CompleteAgentTokenUsageHistory extends z.infer<typeof AgentTokenUsageHistoryModel> {
  agent: CompleteAgent
}

/**
 * RelatedAgentTokenUsageHistoryModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedAgentTokenUsageHistoryModel: z.ZodSchema<CompleteAgentTokenUsageHistory> = z.lazy(() => AgentTokenUsageHistoryModel.extend({
  agent: RelatedAgentModel,
}))
