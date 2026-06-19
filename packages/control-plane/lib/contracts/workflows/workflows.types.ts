import type {
  Prisma,
  Workflow,
  WorkflowRun,
  WorkflowStep,
  WorkflowApproval,
} from "@prisma/client";
import { z } from "zod";
import {
  ListWorkflowsQuerySchema,
  ListTemplatesQuerySchema,
  ListWorkflowRunsQuerySchema,
  ListApprovalsQuerySchema,
  CreateWorkflowBodySchema,
  UpdateWorkflowBodySchema,
  ImportWorkflowBodySchema,
  ExecuteWorkflowBodySchema,
  SetScheduleBodySchema,
  ApprovalCommentBodySchema,
} from "./workflows.schemas";

// ─────────────────────────────────────────────
// Query / body types (inferred from schemas)
// ─────────────────────────────────────────────

export type ListWorkflowsQuery = z.infer<typeof ListWorkflowsQuerySchema>;
export type ListTemplatesQuery = z.infer<typeof ListTemplatesQuerySchema>;
export type ListWorkflowRunsQuery = z.infer<typeof ListWorkflowRunsQuerySchema>;
export type ListApprovalsQuery = z.infer<typeof ListApprovalsQuerySchema>;
export type CreateWorkflowBody = z.infer<typeof CreateWorkflowBodySchema>;
export type UpdateWorkflowBody = z.infer<typeof UpdateWorkflowBodySchema>;
export type ImportWorkflowBody = z.infer<typeof ImportWorkflowBodySchema>;
export type ExecuteWorkflowBody = z.infer<typeof ExecuteWorkflowBodySchema>;
export type SetScheduleBody = z.infer<typeof SetScheduleBodySchema>;
export type ApprovalCommentBody = z.infer<typeof ApprovalCommentBodySchema>;

// ─────────────────────────────────────────────
// Response types (Prisma-derived)
// ─────────────────────────────────────────────

/** A workflow run with its workflow's display name joined in. */
export type WorkflowRunWithName = WorkflowRun & { workflowName: string };

export type WorkflowRunListResponse = {
  runs: WorkflowRunWithName[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type WorkflowRunDetail = {
  run: WorkflowRun;
  workflow: Pick<Workflow, "id" | "name" | "definition"> | null;
  steps: WorkflowStep[];
};

export type WorkflowRunStatus = {
  success: boolean;
  runId: string;
  workflowId: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  results: Prisma.JsonValue | null;
};

export type WorkflowRunHistory = {
  success: boolean;
  run: {
    id: string;
    workflowId: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    results: Prisma.JsonValue | null;
  };
  steps: Array<{
    id: string;
    stepId: string;
    agentId: string | null;
    assignedUserId: string | null;
    assignedUserName: string | null;
    assignedUserEmail: string | null;
    status: string;
    output: Prisma.JsonValue | null;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
  }>;
};

export type WorkflowScheduleConfig = {
  workflowId: string;
  scheduleCron: string | null;
  scheduleEnabled: boolean;
  scheduleLastRun: Date | null;
  scheduleNextRun: Date | null;
};

export type SetScheduleResponse = {
  success: boolean;
  scheduleCron: string | null;
  scheduleEnabled: boolean;
  scheduleNextRun: string | null;
};

export type WorkflowExport = {
  name: string;
  description: string | null;
  definition: Prisma.JsonValue;
  exportedAt: string;
  version: string;
};

export type WorkflowApprovalItem = WorkflowApproval;

export type WorkflowApprovalListResponse = {
  approvals: WorkflowApprovalItem[];
};
