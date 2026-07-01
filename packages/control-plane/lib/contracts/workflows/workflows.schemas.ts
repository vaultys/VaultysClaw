import { z } from "zod";

/** Workflow node graph — opaque JSON validated by the executor, not here. */
export const WorkflowDefinitionSchema = z.record(z.string(), z.unknown());

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export const ListWorkflowsQuerySchema = z.object({
  createdBy: z.string().optional(),
  workspaceId: z.string().optional(),
});

export const ListTemplatesQuerySchema = z.object({
  category: z.string().optional(),
});

export const ListWorkflowRunsQuerySchema = z.object({
  workflowId: z.string().optional(),
  status: z.enum(["running", "completed", "failed"]).optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  sortBy: z.enum(["startedAt", "completedAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export const ListApprovalsQuerySchema = z.object({
  all: z.string().optional(),
});

// ─────────────────────────────────────────────
// Bodies
// ─────────────────────────────────────────────

export const CreateWorkflowBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  definition: WorkflowDefinitionSchema,
  workspaceId: z.string().optional(),
});

export const UpdateWorkflowBodySchema = z.object({
  name: z.string().optional(),
  definition: WorkflowDefinitionSchema.optional(),
  description: z.string().optional(),
  workspaceId: z.string().optional(),
});

export const ImportWorkflowBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  definition: WorkflowDefinitionSchema,
  workspaceId: z.string().optional(),
});

export const ExecuteWorkflowBodySchema = z.object({
  input: z.string().optional(),
});

export const SetScheduleBodySchema = z.object({
  cron: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const ApprovalCommentBodySchema = z.object({
  comment: z.string().optional(),
});
