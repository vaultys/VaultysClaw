import * as z from "zod"

export const DeviceLinkRequestModel = z.object({
  id: z.string(),
  did: z.string(),
  publicKey: z.string().nullish(),
  name: z.string().nullish(),
  status: z.string(),
  userId: z.string().nullish(),
  createdAt: z.date(),
  expiresAt: z.date(),
})
