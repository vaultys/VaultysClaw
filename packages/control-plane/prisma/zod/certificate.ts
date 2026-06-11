import * as z from "zod"
import * as imports from "../null"

export const CertificateModel = z.object({
  id: z.string(),
  key: z.string(),
  registration: z.string().nullish(),
  connection: z.string().nullish(),
  register: z.number().int(),
  data: z.string(),
  status: z.number().int(),
  metadata: z.string().nullish(),
  startedAt: z.date(),
})
