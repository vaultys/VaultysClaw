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

// ToolApprovalRespondBodySchema moved to user/tool-approvals.
