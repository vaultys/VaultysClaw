import * as z from "zod"
import { CompleteWorkflow, RelatedWorkflowModel, CompleteWorkflowStep, RelatedWorkflowStepModel, CompleteWorkflowApproval, RelatedWorkflowApprovalModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const WorkflowRunModel = z.object({
  id: z.string(),
  workflowId: z.string(),
  status: z.string(),
  startedAt: z.date(),
  completedAt: z.date().nullish(),
  results: jsonSchema,
})

export interface CompleteWorkflowRun extends z.infer<typeof WorkflowRunModel> {
  workflow: CompleteWorkflow
  steps: CompleteWorkflowStep[]
  approvals: CompleteWorkflowApproval[]
}

/**
 * RelatedWorkflowRunModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedWorkflowRunModel: z.ZodSchema<CompleteWorkflowRun> = z.lazy(() => WorkflowRunModel.extend({
  workflow: RelatedWorkflowModel,
  steps: RelatedWorkflowStepModel.array(),
  approvals: RelatedWorkflowApprovalModel.array(),
}))
