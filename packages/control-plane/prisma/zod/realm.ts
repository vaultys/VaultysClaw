import * as z from "zod"
import * as imports from "../null"
import { CompleteRealmTokenUsage, RelatedRealmTokenUsageModel, CompleteAgentRealm, RelatedAgentRealmModel, CompleteUserRealm, RelatedUserRealmModel, CompleteRealmSkill, RelatedRealmSkillModel, CompleteKnowledgeSource, RelatedKnowledgeSourceModel, CompleteChannel, RelatedChannelModel, CompleteCredential, RelatedCredentialModel, CompleteModelRealmAccess, RelatedModelRealmAccessModel, CompleteRealmRouterKey, RelatedRealmRouterKeyModel, CompletePolicy, RelatedPolicyModel, CompleteWorkflow, RelatedWorkflowModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const RealmModel = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullish(),
  color: z.string(),
  isDefault: z.boolean(),
  llmConfig: jsonSchema,
  defaultCapabilities: jsonSchema,
  tokenBudgetDaily: z.number().int().nullish(),
  tokenBudgetMonthly: z.number().int().nullish(),
  allowedCapabilities: jsonSchema,
  createdAt: z.date(),
})

export interface CompleteRealm extends z.infer<typeof RealmModel> {
  tokenUsage?: CompleteRealmTokenUsage | null
  agentRealms: CompleteAgentRealm[]
  userRealms: CompleteUserRealm[]
  realmSkills: CompleteRealmSkill[]
  knowledgeSources: CompleteKnowledgeSource[]
  channels: CompleteChannel[]
  credentials: CompleteCredential[]
  modelAccess: CompleteModelRealmAccess[]
  routerKey?: CompleteRealmRouterKey | null
  policies: CompletePolicy[]
  workflows: CompleteWorkflow[]
}

/**
 * RelatedRealmModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedRealmModel: z.ZodSchema<CompleteRealm> = z.lazy(() => RealmModel.extend({
  tokenUsage: RelatedRealmTokenUsageModel.nullish(),
  agentRealms: RelatedAgentRealmModel.array(),
  userRealms: RelatedUserRealmModel.array(),
  realmSkills: RelatedRealmSkillModel.array(),
  knowledgeSources: RelatedKnowledgeSourceModel.array(),
  channels: RelatedChannelModel.array(),
  credentials: RelatedCredentialModel.array(),
  modelAccess: RelatedModelRealmAccessModel.array(),
  routerKey: RelatedRealmRouterKeyModel.nullish(),
  policies: RelatedPolicyModel.array(),
  workflows: RelatedWorkflowModel.array(),
}))
