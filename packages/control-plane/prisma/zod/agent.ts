import * as z from "zod"
import * as imports from "../null"
import { CompleteAgentWorkspace, RelatedAgentWorkspaceModel, CompleteAgentTokenUsage, RelatedAgentTokenUsageModel, CompleteAgentTokenUsageHistory, RelatedAgentTokenUsageHistoryModel, CompleteAgentPeerGrant, RelatedAgentPeerGrantModel, CompleteAgentSkillOverride, RelatedAgentSkillOverrideModel, CompleteKnowledgeSource, RelatedKnowledgeSourceModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const AgentModel = z.object({
  did: z.string(),
  name: z.string(),
  publicKey: z.string().nullish(),
  capabilities: z.string().array(),
  certificateData: z.string().nullish(),
  llmConfig: jsonSchema,
  tokenBudgetDaily: z.number().int().nullish(),
  tokenBudgetMonthly: z.number().int().nullish(),
  dailyPriceSpent: z.number().nullish(),
  litellmVirtualKey: z.string().nullish(),
  litellmAllowedModels: jsonSchema,
  litellmDailyBudget: z.number().nullish(),
  litellmKeyUpdatedAt: z.date().nullish(),
  registeredAt: z.date(),
  lastSeen: z.date(),
  locationLat: z.number().nullish(),
  locationLon: z.number().nullish(),
  locationLabel: z.string().nullish(),
})

export interface CompleteAgent extends z.infer<typeof AgentModel> {
  agentWorkspaces: CompleteAgentWorkspace[]
  tokenUsage?: CompleteAgentTokenUsage | null
  tokenHistory: CompleteAgentTokenUsageHistory[]
  peerGrantsSource: CompleteAgentPeerGrant[]
  peerGrantsTarget: CompleteAgentPeerGrant[]
  skillOverrides: CompleteAgentSkillOverride[]
  knowledgeSources: CompleteKnowledgeSource[]
}

/**
 * RelatedAgentModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedAgentModel: z.ZodSchema<CompleteAgent> = z.lazy(() => AgentModel.extend({
  agentWorkspaces: RelatedAgentWorkspaceModel.array(),
  tokenUsage: RelatedAgentTokenUsageModel.nullish(),
  tokenHistory: RelatedAgentTokenUsageHistoryModel.array(),
  peerGrantsSource: RelatedAgentPeerGrantModel.array(),
  peerGrantsTarget: RelatedAgentPeerGrantModel.array(),
  skillOverrides: RelatedAgentSkillOverrideModel.array(),
  knowledgeSources: RelatedKnowledgeSourceModel.array(),
}))
