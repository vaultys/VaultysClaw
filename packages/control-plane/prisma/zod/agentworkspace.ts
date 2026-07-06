import * as z from "zod"
import * as imports from "../null"
import { CompleteAgent, RelatedAgentModel, CompleteWorkspace, RelatedWorkspaceModel } from "./index"

export const AgentWorkspaceModel = z.object({
  agentDid: z.string(),
  workspaceId: z.string(),
  isPrimary: z.boolean(),
  joinedAt: z.date(),
})

export interface CompleteAgentWorkspace extends z.infer<typeof AgentWorkspaceModel> {
  agent: CompleteAgent
  workspace: CompleteWorkspace
}

/**
 * RelatedAgentWorkspaceModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedAgentWorkspaceModel: z.ZodSchema<CompleteAgentWorkspace> = z.lazy(() => AgentWorkspaceModel.extend({
  agent: RelatedAgentModel,
  workspace: RelatedWorkspaceModel,
}))
