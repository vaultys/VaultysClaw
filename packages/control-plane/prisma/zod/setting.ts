import * as z from "zod"
import * as imports from "../null"

export const SettingModel = z.object({
  key: z.string(),
  value: z.string(),
})
