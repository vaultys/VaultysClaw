import * as z from "zod"
import { CompleteWorkflowRun, RelatedWorkflowRunModel } from "./index"

export const WorkflowApprovalModel = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: z.string(),
  workflowId: z.string(),
  workflowName: z.string(),
  nodeMessage: z.string().nullish(),
  stepInput: z.string().nullish(),
  assignedUserId: z.string(),
  mode: z.string(),
  status: z.string(),
  decidedAt: z.date().nullish(),
  decidedBy: z.string().nullish(),
  comment: z.string().nullish(),
  createdAt: z.date(),
})

export interface CompleteWorkflowApproval extends z.infer<typeof WorkflowApprovalModel> {
  run: CompleteWorkflowRun
}

/**
 * RelatedWorkflowApprovalModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedWorkflowApprovalModel: z.ZodSchema<CompleteWorkflowApproval> = z.lazy(() => WorkflowApprovalModel.extend({
  run: RelatedWorkflowRunModel,
}))
