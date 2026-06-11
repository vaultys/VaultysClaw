import * as z from "zod"
import * as imports from "../null"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const OrgSkillModel = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  version: z.string(),
  icon: z.string().nullish(),
  content: z.string().nullish(),
  configSchema: jsonSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})
