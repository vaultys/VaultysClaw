import * as z from "zod"
import * as imports from "../null"

export const UserInvitationModel = z.object({
  token: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  createdAt: z.date(),
  expiresAt: z.date(),
  claimedAt: z.date().nullish(),
})
