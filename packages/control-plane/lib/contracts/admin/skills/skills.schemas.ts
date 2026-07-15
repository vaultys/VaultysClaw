import { z } from "zod";

// ── Bodies
export const CreateSkillBodySchema = z.object({
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  isRequired: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  content: z.string().nullable().optional(),
});
