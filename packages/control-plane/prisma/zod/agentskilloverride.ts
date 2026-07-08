import * as z from "zod"
import { CompleteAgent, RelatedAgentModel, CompleteWorkspaceSkill, RelatedWorkspaceSkillModel } from "./index"

export const AgentSkillOverrideModel = z.object({
  agentDid: z.string(),
  workspaceSkillId: z.string(),
  enabled: z.boolean(),
})

export interface CompleteAgentSkillOverride extends z.infer<typeof AgentSkillOverrideModel> {
  agent: CompleteAgent
  workspaceSkill: CompleteWorkspaceSkill
}

/**
 * RelatedAgentSkillOverrideModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedAgentSkillOverrideModel: z.ZodSchema<CompleteAgentSkillOverride> = z.lazy(() => AgentSkillOverrideModel.extend({
  agent: RelatedAgentModel,
  workspaceSkill: RelatedWorkspaceSkillModel,
}))
