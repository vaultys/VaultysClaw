import { BaseApi } from "./base";

export interface Model {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google" | "ollama" | "litellm" | string;
  modelId: string;
  baseUrl?: string;
  isDefault?: boolean;
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ModelRealmGrant {
  modelId: string;
  realmId: string;
  isDefault: boolean;
  grantedAt: string;
}

export interface ModelTestRequest {
  provider: Model["provider"];
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
}

export class ModelsApi extends BaseApi {
  list(params?: { page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ models: Model[]; total: number }>(`/api/models${qs ? `?${qs}` : ""}`);
  }

  create(data: Pick<Model, "name" | "provider" | "modelId"> & Partial<Omit<Model, "id" | "createdAt" | "updatedAt">>) {
    return this.post<Model>("/api/models", data);
  }

  test(data: ModelTestRequest) {
    return this.post<{ success: boolean; latencyMs?: number; error?: string }>("/api/models/test", data);
  }

  getOne(id: string) {
    return this.get<Model>(`/api/models/${id}`);
  }

  update(id: string, data: Partial<Omit<Model, "id" | "createdAt" | "updatedAt">>) {
    return this.put<Model>(`/api/models/${id}`, data);
  }

  remove(id: string) {
    return this.delete<void>(`/api/models/${id}`);
  }

  validate(id: string) {
    return this.post<{ valid: boolean; error?: string }>(`/api/models/${id}/validate`);
  }

  // Realm access
  listRealmGrants(id: string) {
    return this.get<{ grants: ModelRealmGrant[] }>(`/api/models/${id}/realms`);
  }

  grantRealm(id: string, data: { realmId: string; isDefault?: boolean }) {
    return this.post<ModelRealmGrant>(`/api/models/${id}/realms`, data);
  }

  revokeRealm(id: string, realmId: string) {
    return this.delete<void>(`/api/models/${id}/realms`, { realmId });
  }
}

export const modelsApi = new ModelsApi();
