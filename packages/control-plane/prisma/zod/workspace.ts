import * as z from "zod"
import * as imports from "../null"
import { CompleteWorkspaceTokenUsage, RelatedWorkspaceTokenUsageModel, CompleteAgentWorkspace, RelatedAgentWorkspaceModel, CompleteUserWorkspace, RelatedUserWorkspaceModel, CompleteWorkspaceSkill, RelatedWorkspaceSkillModel, CompleteKnowledgeSource, RelatedKnowledgeSourceModel, CompleteChannel, RelatedChannelModel, CompleteCredential, RelatedCredentialModel, CompleteModelWorkspaceAccess, RelatedModelWorkspaceAccessModel, CompleteWorkspaceRouterKey, RelatedWorkspaceRouterKeyModel, CompletePolicy, RelatedPolicyModel, CompleteWorkflow, RelatedWorkflowModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const WorkspaceModel = z.object({
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

export interface CompleteWorkspace extends z.infer<typeof WorkspaceModel> {
  tokenUsage?: CompleteWorkspaceTokenUsage | null
  agentWorkspaces: CompleteAgentWorkspace[]
  userWorkspaces: CompleteUserWorkspace[]
  workspaceSkills: CompleteWorkspaceSkill[]
  knowledgeSources: CompleteKnowledgeSource[]
  channels: CompleteChannel[]
  credentials: CompleteCredential[]
  modelAccess: CompleteModelWorkspaceAccess[]
  routerKey?: CompleteWorkspaceRouterKey | null
  policies: CompletePolicy[]
  workflows: CompleteWorkflow[]
}

/**
 * RelatedWorkspaceModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedWorkspaceModel: z.ZodSchema<CompleteWorkspace> = z.lazy(() => WorkspaceModel.extend({
  tokenUsage: RelatedWorkspaceTokenUsageModel.nullish(),
  agentWorkspaces: RelatedAgentWorkspaceModel.array(),
  userWorkspaces: RelatedUserWorkspaceModel.array(),
  workspaceSkills: RelatedWorkspaceSkillModel.array(),
  knowledgeSources: RelatedKnowledgeSourceModel.array(),
  channels: RelatedChannelModel.array(),
  credentials: RelatedCredentialModel.array(),
  modelAccess: RelatedModelWorkspaceAccessModel.array(),
  routerKey: RelatedWorkspaceRouterKeyModel.nullish(),
  policies: RelatedPolicyModel.array(),
  workflows: RelatedWorkflowModel.array(),
}))
