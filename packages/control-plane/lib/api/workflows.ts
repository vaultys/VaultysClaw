import { WorkflowSummary } from "@/lib/api/utils/api-types";
import { BaseApi } from "./base";

export interface Workflow extends WorkflowSummary {
  description?: string;
  nodes: WorkflowNode[];
  variables?: Record<string, unknown>;
}

export interface WorkflowNode {
  id: string;
  type: string;
  label?: string;
  config?: Record<string, unknown>;
  next?: string | null;
}

export interface WorkflowSchedule {
  id: string;
  workflowId: string;
  cron: string;
  enabled: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt?: string;
  triggeredBy?: string;
  error?: string;
}

export interface WorkflowRunStep {
  nodeId: string;
  label?: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  nodes: WorkflowNode[];
}

export class WorkflowsApi extends BaseApi {
  // Workflows CRUD
  list(params?: { realm?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.realm) query.set("realm", params.realm);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ workflows: Workflow[]; total: number }>(
      `/api/workflows${qs ? `?${qs}` : ""}`
    );
  }

  create(
    data: Pick<Workflow, "name" | "realmId"> &
      Partial<Omit<Workflow, "id" | "createdAt" | "updatedAt">>
  ) {
    return this.post<Workflow>("/api/workflows", data);
  }

  getOne(id: string) {
    return this.get<Workflow>(`/api/workflows/${id}`);
  }

  update(
    id: string,
    data: Partial<
      Pick<Workflow, "name" | "description" | "nodes" | "enabled" | "variables">
    >
  ) {
    return this.patch<Workflow>(`/api/workflows/${id}`, data);
  }

  remove(id: string) {
    return this.delete<void>(`/api/workflows/${id}`);
  }

  execute(id: string, payload?: Record<string, unknown>) {
    return this.post<{ runId: string }>(
      `/api/workflows/${id}/execute`,
      payload
    );
  }

  export(id: string) {
    return this.get<Record<string, unknown>>(`/api/workflows/${id}/export`);
  }

  import(data: Record<string, unknown>) {
    return this.post<Workflow>("/api/workflows/import", data);
  }

  // Schedule
  getSchedule(id: string) {
    return this.get<WorkflowSchedule>(`/api/workflows/${id}/schedule`);
  }

  setSchedule(id: string, data: Pick<WorkflowSchedule, "cron" | "enabled">) {
    return this.post<WorkflowSchedule>(`/api/workflows/${id}/schedule`, data);
  }

  deleteSchedule(id: string) {
    return this.delete<void>(`/api/workflows/${id}/schedule`);
  }

  // Templates
  listTemplates() {
    return this.get<{ templates: WorkflowTemplate[] }>(
      "/api/workflows/templates"
    );
  }

  getTemplate(templateId: string) {
    return this.get<WorkflowTemplate>(`/api/workflows/templates/${templateId}`);
  }

  seedTestWorkflows() {
    return this.post<void>("/api/workflows/test-seed");
  }

  // Runs (list + get)
  listRuns(params?: {
    workflowId?: string;
    status?: WorkflowRun["status"];
    page?: number;
    pageSize?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.workflowId) query.set("workflowId", params.workflowId);
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ runs: WorkflowRun[]; total: number }>(
      `/api/workflow-runs${qs ? `?${qs}` : ""}`
    );
  }

  getRun(id: string) {
    return this.get<WorkflowRun>(`/api/workflow-runs/${id}`);
  }

  getRunStatus(runId: string) {
    return this.get<
      Pick<WorkflowRun, "id" | "status" | "startedAt" | "completedAt" | "error">
    >(`/api/workflows/runs/${runId}/status`);
  }

  getRunHistory(runId: string) {
    return this.get<{ steps: WorkflowRunStep[] }>(
      `/api/workflows/runs/${runId}/history`
    );
  }
}

export const workflowsApi = new WorkflowsApi();
