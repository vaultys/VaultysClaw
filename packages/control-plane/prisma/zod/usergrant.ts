import * as z from "zod"
import * as imports from "../null"
import { CompleteUser, RelatedUserModel, CompleteDelegationCert, RelatedDelegationCertModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const UserGrantModel = z.object({
  id: z.string(),
  userDid: z.string(),
  agentDid: z.string().nullish(),
  capabilities: jsonSchema,
  grantedBy: z.string(),
  expiresAt: z.date().nullish(),
  createdAt: z.date(),
})

export interface CompleteUserGrant extends z.infer<typeof UserGrantModel> {
  user: CompleteUser
  delegationCerts: CompleteDelegationCert[]
}

/**
 * RelatedUserGrantModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedUserGrantModel: z.ZodSchema<CompleteUserGrant> = z.lazy(() => UserGrantModel.extend({
  user: RelatedUserModel,
  delegationCerts: RelatedDelegationCertModel.array(),
}))
