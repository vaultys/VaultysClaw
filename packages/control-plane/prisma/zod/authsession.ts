import * as z from "zod"

export const AuthSessionModel = z.object({
  id: z.string(),
  sessionKey: z.string(),
  certificateData: z.string(),
  status: z.number().int(),
  agentDid: z.string().nullish(),
  createdAt: z.date(),
})
