import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";
import type { Workflow, WorkflowRun, WorkflowStep } from "@prisma/client";

/** Workflow node graph — opaque JSON validated by the executor, not here. */
const WorkflowDefinition = z.record(z.string(), z.unknown());

const IdParam = z.object({ id: z.string().min(1) });

export const workflowsContract = c.router({
  list: {
    method: "GET",
    path: "/api/workflows",
    summary: "List workflows visible to the user",
    responses: {
      200: c.type<{ success: boolean; workflows: Workflow[] }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/workflows",
    summary: "Save a new workflow",
    body: z.object({
      name: z.string(),
      description: z.string().optional(),
      definition: WorkflowDefinition,
      realmId: z.string().optional(),
    }),
    responses: {
      200: c.type<{
        success: boolean;
        id: string;
        name: string;
        description?: string;
        realmId?: string;
      }>(),
      ...commonErrorResponses,
    },
  },

  import: {
    method: "POST",
    path: "/api/workflows/import",
    summary: "Import a new workflow definition",
    body: z.object({
      name: z.string(),
      description: z.string().optional(),
      definition: WorkflowDefinition,
      realmId: z.string().optional(),
    }),
    responses: {
      200: z.object({ success: z.boolean(), id: z.string(), message: z.string() }),
      ...commonErrorResponses,
    },
  },

  listTemplates: {
    method: "GET",
    path: "/api/workflows/templates",
    summary: "Retrieve workflow templates",
    query: z.object({ category: z.string().optional() }),
    responses: {
      200: c.type<{ success: boolean; templates: Array<Record<string, unknown>> }>(),
      ...commonErrorResponses,
    },
  },

  getTemplate: {
    method: "GET",
    path: "/api/workflows/templates/:templateId",
    pathParams: z.object({ templateId: z.string() }),
    summary: "Retrieve a workflow template by ID",
    responses: {
      200: c.type<{ success: boolean; template: Record<string, unknown> }>(),
      ...commonErrorResponses,
    },
  },

  runStatus: {
    method: "GET",
    path: "/api/workflows/runs/:runId/status",
    pathParams: z.object({ runId: z.string() }),
    summary: "Get the status of a workflow run",
    responses: {
      200: c.type<{
        success: boolean;
        runId: string;
        workflowId: string;
        status: string;
        startedAt: string;
        completedAt: string | null;
        results: Record<string, unknown> | null;
      }>(),
      ...commonErrorResponses,
    },
  },

  runHistory: {
    method: "GET",
    path: "/api/workflows/runs/:runId/history",
    pathParams: z.object({ runId: z.string() }),
    summary: "Get complete execution history of a workflow run",
    responses: {
      200: c.type<{ success: boolean; run: WorkflowRun; steps: WorkflowStep[] }>(),
      ...commonErrorResponses,
    },
  },

  getOne: {
    method: "GET",
    path: "/api/workflows/:id",
    pathParams: IdParam,
    summary: "Fetch a single workflow by ID",
    responses: {
      200: c.type<{ success: boolean; workflow: Workflow }>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/workflows/:id",
    pathParams: IdParam,
    summary: "Update a workflow",
    body: z.object({
      name: z.string().optional(),
      definition: WorkflowDefinition.optional(),
      description: z.string().optional(),
      realmId: z.string().optional(),
    }),
    responses: {
      200: z.object({ success: z.boolean(), id: z.string() }),
      ...commonErrorResponses,
    },
  },

  remove: {
    method: "DELETE",
    path: "/api/workflows/:id",
    pathParams: IdParam,
    summary: "Delete a workflow",
    responses: {
      200: z.object({ success: z.boolean(), id: z.string() }),
      ...commonErrorResponses,
    },
  },

  getSchedule: {
    method: "GET",
    path: "/api/workflows/:id/schedule",
    pathParams: IdParam,
    summary: "Retrieve the current schedule configuration for a workflow",
    responses: {
      200: z.object({
        workflowId: z.string(),
        scheduleCron: z.string().nullable(),
        scheduleEnabled: z.boolean(),
        scheduleLastRun: z.string().nullable(),
        scheduleNextRun: z.string().nullable(),
      }),
      ...commonErrorResponses,
    },
  },

  setSchedule: {
    method: "POST",
    path: "/api/workflows/:id/schedule",
    pathParams: IdParam,
    summary: "Set or update the cron schedule for a workflow",
    body: z.object({
      cron: z.string().optional(),
      enabled: z.boolean().optional(),
    }),
    responses: {
      200: z.object({
        success: z.boolean(),
        scheduleCron: z.string(),
        scheduleEnabled: z.boolean(),
        scheduleNextRun: z.string(),
      }),
      ...commonErrorResponses,
    },
  },

  clearSchedule: {
    method: "DELETE",
    path: "/api/workflows/:id/schedule",
    pathParams: IdParam,
    summary: "Disable or clear the workflow schedule",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  export: {
    method: "GET",
    path: "/api/workflows/:id/export",
    pathParams: IdParam,
    summary: "Export a workflow by ID",
    responses: {
      200: c.type<{
        name: string;
        description: string;
        definition: Record<string, unknown>;
        exportedAt: string;
        version: string;
      }>(),
      ...commonErrorResponses,
    },
  },

  execute: {
    method: "POST",
    path: "/api/workflows/:id/execute",
    pathParams: IdParam,
    summary: "Start a new workflow run",
    body: z.object({ input: z.string().optional() }),
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
});

export const workflowRunsContract = c.router({
  list: {
    method: "GET",
    path: "/api/workflow-runs",
    summary: "List workflow runs with optional pagination and filters",
    query: z.object({
      workflowId: z.string().optional(),
      status: z.enum(["running", "completed", "failed"]).optional(),
      page: z.coerce.number().optional(),
      pageSize: z.coerce.number().optional(),
      sortBy: z.enum(["startedAt", "completedAt"]).optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
    }),
    responses: {
      200: c.type<{
        runs: WorkflowRun[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>(),
      ...commonErrorResponses,
    },
  },

  getOne: {
    method: "GET",
    path: "/api/workflow-runs/:id",
    pathParams: IdParam,
    summary: "Get a specific workflow run with its history and steps",
    responses: {
      200: c.type<{
        run: WorkflowRun;
        workflow: Workflow | null;
        steps: WorkflowStep[];
      }>(),
      ...commonErrorResponses,
    },
  },
});

export const workflowApprovalsContract = c.router({
  list: {
    method: "GET",
    path: "/api/workflow-approvals",
    summary: "Retrieve approval items for the logged-in user",
    query: z.object({ all: z.string().optional() }),
    responses: {
      200: c.type<{ approvals: Array<Record<string, unknown>> }>(),
      ...commonErrorResponses,
    },
  },

  approve: {
    method: "POST",
    path: "/api/workflow-approvals/:id/approve",
    pathParams: IdParam,
    summary: "Approve a pending workflow step",
    body: z.object({ comment: z.string().optional() }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  reject: {
    method: "POST",
    path: "/api/workflow-approvals/:id/reject",
    pathParams: IdParam,
    summary: "Reject a pending workflow step",
    body: z.object({ comment: z.string().optional() }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  dismiss: {
    method: "POST",
    path: "/api/workflow-approvals/:id/dismiss",
    pathParams: IdParam,
    summary: "Dismiss a workflow notification",
    body: c.noBody(),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },
});
