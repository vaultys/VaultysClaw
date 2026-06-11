import * as z from "zod"

export const SettingModel = z.object({
  key: z.string(),
  value: z.string(),
})
