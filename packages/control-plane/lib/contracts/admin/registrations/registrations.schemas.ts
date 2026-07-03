import { z } from "zod";

// ── Path params
export const RegistrationIdParamSchema = z.object({ id: z.string() });

// ── Bodies
export const BatchRejectBodySchema = z.object({
  ids: z.array(z.string()),
  reason: z.string().optional(),
});

export const RejectRegistrationBodySchema = z.object({
  reason: z.string().optional(),
});

export const ApproveRegistrationBodySchema = z.object({
  capabilities: z.array(z.string()).optional(),
  workspaceIds: z.array(z.string()).optional(),
});

export const ToolApprovalRespondBodySchema = z.object({
  requestId: z.string(),
  approved: z.boolean(),
  reason: z.string().optional(),
});
