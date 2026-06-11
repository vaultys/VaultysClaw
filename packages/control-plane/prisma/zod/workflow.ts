import * as z from "zod"
import * as imports from "../null"
import { CompleteRealm, RelatedRealmModel, CompleteWorkflowRun, RelatedWorkflowRunModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const WorkflowModel = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  definition: jsonSchema,
  realmId: z.string().nullish(),
  createdBy: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
  scheduleCron: z.string().nullish(),
  scheduleEnabled: z.boolean(),
  scheduleLastRun: z.date().nullish(),
  scheduleNextRun: z.date().nullish(),
})

export interface CompleteWorkflow extends z.infer<typeof WorkflowModel> {
  realm?: CompleteRealm | null
  runs: CompleteWorkflowRun[]
}

/**
 * RelatedWorkflowModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedWorkflowModel: z.ZodSchema<CompleteWorkflow> = z.lazy(() => WorkflowModel.extend({
  realm: RelatedRealmModel.nullish(),
  runs: RelatedWorkflowRunModel.array(),
}))
