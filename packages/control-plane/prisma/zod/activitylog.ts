import * as z from "zod"

export const ActivityLogModel = z.object({
  id: z.number().int(),
  event: z.string(),
  agentDid: z.string().nullish(),
  agentName: z.string().nullish(),
  details: z.string().nullish(),
  createdAt: z.date(),
})
