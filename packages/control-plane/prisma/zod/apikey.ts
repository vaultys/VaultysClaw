import * as z from "zod"
import * as imports from "../null"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const ApiKeyModel = z.object({
  id: z.string(),
  name: z.string(),
  keyHash: z.string(),
  keyPrefix: z.string(),
  allowedRoutes: jsonSchema,
  workspaceId: z.string().nullish(),
  isWorkspaceAdmin: z.boolean(),
  createdBy: z.string(),
  createdAt: z.date(),
  lastUsedAt: z.date().nullish(),
  expiresAt: z.date().nullish(),
  isActive: z.boolean(),
})
