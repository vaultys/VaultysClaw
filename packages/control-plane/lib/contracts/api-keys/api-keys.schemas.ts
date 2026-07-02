import { z } from "zod";

// ── Path params
export const ApiKeyIdParamSchema = z.object({ id: z.string().min(1) });

// ── Bodies
export const ApiKeyCreateRequestSchema = z.object({
  name: z.string(),
  allowedRoutes: z.array(z.string()),
  workspaceId: z.string().nullable().optional(),
  isWorkspaceAdmin: z.boolean().optional(),
  expiresAt: z.number().nullable().optional(),
});

export const ApiKeyUpdateRequestSchema = z.object({
  name: z.string().optional(),
  allowedRoutes: z.array(z.string()).optional(),
  workspaceId: z.string().nullable().optional(),
  isWorkspaceAdmin: z.boolean().optional(),
  expiresAt: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});
