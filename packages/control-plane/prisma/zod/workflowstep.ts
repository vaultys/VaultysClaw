import * as z from "zod"
import * as imports from "../null"
import { CompleteWorkflowRun, RelatedWorkflowRunModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const WorkflowStepModel = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: z.string(),
  agentId: z.string().nullish(),
  status: z.string(),
  output: jsonSchema,
  error: z.string().nullish(),
  startedAt: z.date().nullish(),
  completedAt: z.date().nullish(),
})

export interface CompleteWorkflowStep extends z.infer<typeof WorkflowStepModel> {
  run: CompleteWorkflowRun
}

/**
 * RelatedWorkflowStepModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedWorkflowStepModel: z.ZodSchema<CompleteWorkflowStep> = z.lazy(() => WorkflowStepModel.extend({
  run: RelatedWorkflowRunModel,
}))
