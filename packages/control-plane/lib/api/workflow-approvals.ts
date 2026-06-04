import { BaseApi } from "./base";

export interface WorkflowApproval {
  id: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  label?: string;
  description?: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected" | "dismissed";
  resolvedAt?: string;
  resolvedBy?: string;
}

export class WorkflowApprovalsApi extends BaseApi {
  list(params?: { status?: WorkflowApproval["status"]; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ approvals: WorkflowApproval[]; total: number }>(
      `/api/workflow-approvals${qs ? `?${qs}` : ""}`
    );
  }

  approve(id: string, comment?: string) {
    return this.post<WorkflowApproval>(`/api/workflow-approvals/${id}/approve`, { comment });
  }

  reject(id: string, reason?: string) {
    return this.post<WorkflowApproval>(`/api/workflow-approvals/${id}/reject`, { reason });
  }

  dismiss(id: string) {
    return this.post<WorkflowApproval>(`/api/workflow-approvals/${id}/dismiss`);
  }
}

export const workflowApprovalsApi = new WorkflowApprovalsApi();
