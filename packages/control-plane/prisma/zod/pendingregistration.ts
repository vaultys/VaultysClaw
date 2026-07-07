import * as z from "zod"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const PendingRegistrationModel = z.object({
  id: z.string(),
  sessionId: z.string(),
  agentName: z.string(),
  status: z.string(),
  requestedCapabilities: jsonSchema,
  assignedCapabilities: jsonSchema,
  createdAt: z.date(),
})
