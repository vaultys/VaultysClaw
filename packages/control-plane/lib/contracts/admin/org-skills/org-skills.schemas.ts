import { z } from "zod";

// ── Path params
export const OrgSkillIdParamSchema = z.object({ id: z.string().min(1) });

// ── Bodies
export const CreateOrgSkillBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  icon: z.string().optional(),
  content: z.string().optional(),
  configSchema: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateOrgSkillBodySchema = z.object({
  description: z.string().nullable().optional(),
  version: z.string().optional(),
  icon: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  configSchema: z.record(z.string(), z.unknown()).optional(),
});
