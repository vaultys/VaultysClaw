import * as z from "zod"
import * as imports from "../null"
import { CompleteAgent, RelatedAgentModel } from "./index"

export const AgentTokenUsageModel = z.object({
  agentDid: z.string(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  updatedAt: z.date(),
})

export interface CompleteAgentTokenUsage extends z.infer<typeof AgentTokenUsageModel> {
  agent: CompleteAgent
}

/**
 * RelatedAgentTokenUsageModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedAgentTokenUsageModel: z.ZodSchema<CompleteAgentTokenUsage> = z.lazy(() => AgentTokenUsageModel.extend({
  agent: RelatedAgentModel,
}))
