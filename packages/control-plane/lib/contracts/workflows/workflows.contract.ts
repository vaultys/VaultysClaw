import { z } from "zod";
import { c } from "../contract";
import { commonErrorResponses } from "../common";
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
import type {
  WorkflowExport,
  WorkflowScheduleConfig,
  SetScheduleResponse,
  WorkflowRunStatus,
  WorkflowRunHistory,
  WorkflowRunListResponse,
  WorkflowRunDetail,
  WorkflowApprovalListResponse,
} from "./workflows.types";
import { Workflow } from "@prisma/client";

const IdParam = z.object({ id: z.string().min(1) });
const RunIdParam = z.object({ runId: z.string().min(1) });
const TemplateIdParam = z.object({ templateId: z.string().min(1) });

export const workflowsContract = c.router({
  list: {
    method: "GET",
    path: "/api/workflows",
    summary: "List workflows visible to the user",
    query: ListWorkflowsQuerySchema,
    responses: {
      200: c.type<{ workflows: Workflow[] }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/workflows",
    summary: "Save a new workflow",
    body: CreateWorkflowBodySchema,
    responses: {
      200: c.type<{ workflow: Workflow }>(),
      ...commonErrorResponses,
    },
  },

  import: {
    method: "POST",
    path: "/api/workflows/import",
    summary: "Import a new workflow definition",
    body: ImportWorkflowBodySchema,
    responses: {
      200: c.type<{ workflow: Workflow }>(),
      ...commonErrorResponses,
    },
  },

  listTemplates: {
    method: "GET",
    path: "/api/workflows/templates",
    summary: "Retrieve workflow templates",
    query: ListTemplatesQuerySchema,
    responses: {
      200: c.type<{
        templates: Array<Record<string, unknown>>;
      }>(),
      ...commonErrorResponses,
    },
  },

  getTemplate: {
    method: "GET",
    path: "/api/workflows/templates/:templateId",
    pathParams: TemplateIdParam,
    summary: "Retrieve a workflow template by ID",
    responses: {
      200: c.type<{ template: Record<string, unknown> }>(),
      ...commonErrorResponses,
    },
  },

  runStatus: {
    method: "GET",
    path: "/api/workflows/runs/:runId/status",
    pathParams: RunIdParam,
    summary: "Get the status of a workflow run",
    responses: {
      200: c.type<WorkflowRunStatus>(),
      ...commonErrorResponses,
    },
  },

  runHistory: {
    method: "GET",
    path: "/api/workflows/runs/:runId/history",
    pathParams: RunIdParam,
    summary: "Get complete execution history of a workflow run",
    responses: {
      200: c.type<WorkflowRunHistory>(),
      ...commonErrorResponses,
    },
  },

  getOne: {
    method: "GET",
    path: "/api/workflows/:id",
    pathParams: IdParam,
    summary: "Fetch a single workflow by ID",
    responses: {
      200: c.type<{ workflow: Workflow }>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/workflows/:id",
    pathParams: IdParam,
    summary: "Update a workflow",
    body: UpdateWorkflowBodySchema,
    responses: {
      200: c.type<{ workflow: Workflow }>(),
      ...commonErrorResponses,
    },
  },

  remove: {
    method: "DELETE",
    path: "/api/workflows/:id",
    pathParams: IdParam,
    summary: "Delete a workflow",
    responses: {
      200: c.type<{ workflow: Workflow }>(),
      ...commonErrorResponses,
    },
  },

  getSchedule: {
    method: "GET",
    path: "/api/workflows/:id/schedule",
    pathParams: IdParam,
    summary: "Retrieve the current schedule configuration for a workflow",
    responses: {
      200: c.type<WorkflowScheduleConfig>(),
      ...commonErrorResponses,
    },
  },

  setSchedule: {
    method: "POST",
    path: "/api/workflows/:id/schedule",
    pathParams: IdParam,
    summary: "Set or update the cron schedule for a workflow",
    body: SetScheduleBodySchema,
    responses: {
      200: c.type<SetScheduleResponse>(),
      ...commonErrorResponses,
    },
  },

  clearSchedule: {
    method: "DELETE",
    path: "/api/workflows/:id/schedule",
    pathParams: IdParam,
    summary: "Disable or clear the workflow schedule",
    responses: {
      200: z.object({ success: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  export: {
    method: "GET",
    path: "/api/workflows/:id/export",
    pathParams: IdParam,
    summary: "Export a workflow by ID",
    responses: {
      200: c.type<WorkflowExport>(),
      ...commonErrorResponses,
    },
  },

  execute: {
    method: "POST",
    path: "/api/workflows/:id/execute",
    pathParams: IdParam,
    summary: "Start a new workflow run",
    body: ExecuteWorkflowBodySchema,
    responses: {
      200: z.object({
        success: z.boolean(),
        runId: z.string(),
        workflowId: z.string(),
        status: z.string(),
      }),
      ...commonErrorResponses,
    },
  },

  testSeed: {
    method: "POST",
    path: "/api/workflows/test-seed",
    summary: "Create a test workflow with 4 real online agents in sequence",
    body: c.noBody(),
    responses: {
      200: c.type<{
        success: boolean;
        workflowId: string;
        name: string;
        realmId: string;
        agents: Array<{ did: string; name: string; capability: string }>;
        nodes: unknown[];
      }>(),
      ...commonErrorResponses,
    },
  },
});

export const workflowRunsContract = c.router({
  list: {
    method: "GET",
    path: "/api/workflows/runs",
    summary: "List workflow runs with optional pagination and filters",
    query: ListWorkflowRunsQuerySchema,
    responses: {
      200: c.type<WorkflowRunListResponse>(),
      ...commonErrorResponses,
    },
  },

  getOne: {
    method: "GET",
    path: "/api/workflows/runs/:runId",
    pathParams: RunIdParam,
    summary: "Get a specific workflow run with its history and steps",
    responses: {
      200: c.type<WorkflowRunDetail>(),
      ...commonErrorResponses,
    },
  },
});

export const workflowApprovalsContract = c.router({
  list: {
    method: "GET",
    path: "/api/workflows/approvals",
    summary: "Retrieve approval items for the logged-in user",
    query: ListApprovalsQuerySchema,
    responses: {
      200: c.type<WorkflowApprovalListResponse>(),
      ...commonErrorResponses,
    },
  },

  approve: {
    method: "POST",
    path: "/api/workflows/approvals/:id/approve",
    pathParams: IdParam,
    summary: "Approve a pending workflow step",
    body: ApprovalCommentBodySchema,
    responses: {
      200: z.object({ success: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  reject: {
    method: "POST",
    path: "/api/workflows/approvals/:id/reject",
    pathParams: IdParam,
    summary: "Reject a pending workflow step",
    body: ApprovalCommentBodySchema,
    responses: {
      200: z.object({ success: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  dismiss: {
    method: "POST",
    path: "/api/workflows/approvals/:id/dismiss",
    pathParams: IdParam,
    summary: "Dismiss a workflow notification",
    body: c.noBody(),
    responses: {
      200: z.object({ success: z.boolean() }),
      ...commonErrorResponses,
    },
  },
});
