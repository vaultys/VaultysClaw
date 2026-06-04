import { BaseApi } from "./base";

export interface Intent {
  id: string;
  agentDid: string;
  name: string;
  description?: string;
  payload?: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
}

export interface CreateIntentRequest {
  agentDid: string;
  name: string;
  description?: string;
  payload?: Record<string, unknown>;
}

export class IntentsApi extends BaseApi {
  list(params?: { agentDid?: string; status?: Intent["status"]; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.agentDid) query.set("agentDid", params.agentDid);
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ intents: Intent[]; total: number }>(`/api/intents${qs ? `?${qs}` : ""}`);
  }

  create(data: CreateIntentRequest) {
    return this.post<Intent>("/api/intents", data);
  }
}

export const intentsApi = new IntentsApi();
