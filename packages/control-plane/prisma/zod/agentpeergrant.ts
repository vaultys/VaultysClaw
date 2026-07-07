import * as z from "zod"
import { CompleteAgent, RelatedAgentModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const AgentPeerGrantModel = z.object({
  id: z.string(),
  sourceDid: z.string(),
  targetDid: z.string(),
  targetName: z.string(),
  skillDescription: z.string(),
  capabilities: jsonSchema,
  certificate: z.string(),
  expiresAt: z.date().nullish(),
  createdAt: z.date(),
})

export interface CompleteAgentPeerGrant extends z.infer<typeof AgentPeerGrantModel> {
  sourceAgent: CompleteAgent
  targetAgent: CompleteAgent
}

/**
 * RelatedAgentPeerGrantModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedAgentPeerGrantModel: z.ZodSchema<CompleteAgentPeerGrant> = z.lazy(() => AgentPeerGrantModel.extend({
  sourceAgent: RelatedAgentModel,
  targetAgent: RelatedAgentModel,
}))
