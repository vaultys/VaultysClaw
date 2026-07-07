import * as z from "zod"
import { CompleteUserGrant, RelatedUserGrantModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const DelegationCertModel = z.object({
  id: z.string(),
  grantId: z.string(),
  userDid: z.string(),
  agentDid: z.string(),
  capabilities: jsonSchema,
  certificate: z.string(),
  expiresAt: z.date().nullish(),
  createdAt: z.date(),
})

export interface CompleteDelegationCert extends z.infer<typeof DelegationCertModel> {
  grant: CompleteUserGrant
}

/**
 * RelatedDelegationCertModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedDelegationCertModel: z.ZodSchema<CompleteDelegationCert> = z.lazy(() => DelegationCertModel.extend({
  grant: RelatedUserGrantModel,
}))
