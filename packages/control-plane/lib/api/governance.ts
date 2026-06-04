import { BaseApi } from "./base";

export interface Policy {
  id: string;
  name: string;
  description?: string;
  type: string;
  rules: Record<string, unknown>;
  realmId?: string;
  createdBy: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  actorDid: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  realmId?: string;
  createdAt: string;
}

export interface GovernanceSummary {
  totalPolicies: number;
  activePolicies: number;
  pendingApprovals: number;
  recentEvents: AuditEvent[];
}

export interface ToolApproval {
  id: string;
  agentDid: string;
  toolName: string;
  args: Record<string, unknown>;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  resolvedAt?: string;
  resolvedBy?: string;
}

export class GovernanceApi extends BaseApi {
  // Policies
  listPolicies(params?: { realmId?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.realmId) query.set("realmId", params.realmId);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ policies: Policy[]; total: number }>(`/api/policies${qs ? `?${qs}` : ""}`);
  }

  createPolicy(data: Pick<Policy, "name" | "type" | "rules"> & Partial<Pick<Policy, "description" | "realmId">>) {
    return this.post<Policy>("/api/policies", data);
  }

  getPolicy(id: string) {
    return this.get<Policy>(`/api/policies/${id}`);
  }

  removePolicy(id: string) {
    return this.delete<void>(`/api/policies/${id}`);
  }

  // Audit log
  listAuditEvents(params?: {
    actorDid?: string;
    action?: string;
    realmId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.actorDid) query.set("actorDid", params.actorDid);
    if (params?.action) query.set("action", params.action);
    if (params?.realmId) query.set("realmId", params.realmId);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ events: AuditEvent[]; total: number }>(`/api/governance/audit${qs ? `?${qs}` : ""}`);
  }

  getAuditEvent(id: string) {
    return this.get<AuditEvent>(`/api/governance/audit/${id}`);
  }

  getSummary() {
    return this.get<GovernanceSummary>("/api/governance/summary");
  }

  // Tool approvals
  listToolApprovals(params?: { status?: ToolApproval["status"]; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ approvals: ToolApproval[]; total: number }>(
      `/api/tool-approvals${qs ? `?${qs}` : ""}`
    );
  }

  resolveToolApproval(id: string, approved: boolean, reason?: string) {
    return this.post<ToolApproval>("/api/tool-approvals", { id, approved, reason });
  }
}

export const governanceApi = new GovernanceApi();
