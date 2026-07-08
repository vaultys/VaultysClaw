import * as z from "zod"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const IntentLogModel = z.object({
  intentId: z.string(),
  agentDid: z.string().nullish(),
  action: z.string(),
  params: jsonSchema,
  status: z.string(),
  output: jsonSchema,
  error: z.string().nullish(),
  signature: z.string().nullish(),
  sentAt: z.date(),
  completedAt: z.date().nullish(),
})
